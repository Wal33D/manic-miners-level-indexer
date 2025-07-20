import fetch from 'node-fetch';
import {
  DiscordMessage,
  Level,
  LevelFile,
  LevelMetadata,
  MapSource,
  IndexerResult,
  IndexerProgress,
} from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { getSourceLevelsDir } from '../utils/sourceUtils';
import { DiscordAuth } from '../auth/discordAuth';
import path from 'path';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { Readable } from 'stream';
import { DiscordStateManager } from './discord/DiscordStateManager';

interface DiscordThread {
  id: string;
  name: string;
  parent_id: string;
  message_count: number;
  member_count: number;
  thread_metadata: {
    archived: boolean;
    archive_timestamp: string;
  };
}

interface DiscordAPIMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
  };
  timestamp: string;
  edited_timestamp: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    size: number;
    url: string;
    proxy_url: string;
  }>;
}

export class DiscordUnifiedIndexer {
  private token?: string;
  private channels: string[];
  private outputDir: string;
  private source: MapSource;
  private headers: Record<string, string> = {};
  private discordAuth: DiscordAuth;
  private messageCache: Map<string, DiscordMessage> = new Map(); // Cache for associating images
  private excludedThreads: Set<string>;
  private retryAttempts: number;
  private downloadTimeout: number;
  private skipExisting: boolean;
  private stateManager: DiscordStateManager;

  constructor(
    channels: string[],
    outputDir: string,
    source: MapSource,
    excludedThreads?: string[],
    retryAttempts?: number,
    downloadTimeout?: number,
    skipExisting?: boolean
  ) {
    this.channels = channels;
    this.outputDir = outputDir;
    this.source = source;
    this.discordAuth = new DiscordAuth(path.join(outputDir, '.auth'));
    this.excludedThreads = new Set(excludedThreads || []);
    this.retryAttempts = retryAttempts ?? 3;
    this.downloadTimeout = downloadTimeout ?? 60000; // Default 60 seconds
    this.skipExisting = skipExisting ?? true; // Default to true
    logger.debug(`[DEBUG] DiscordUnifiedIndexer constructor - skipExisting=${this.skipExisting}, passed value=${skipExisting}`);

    // Initialize state manager
    const sourceName = source === MapSource.DISCORD_COMMUNITY ? 'community' : 'archive';
    this.stateManager = new DiscordStateManager(outputDir, sourceName);
  }

  setToken(token: string): void {
    this.token = token;
    // Set up headers with the provided token
    this.headers = {
      Authorization: this.token,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async initialize(): Promise<void> {
    try {
      // State is now loaded in indexDiscord() before this method is called
      logger.info(`Skip existing: ${this.skipExisting}`);

      // Skip authentication if token is already set
      if (this.token) {
        logger.info('Using pre-authenticated Discord token');
        await this.testToken();
        return;
      }

      // Get token using the auth module
      const authResult = await this.discordAuth.getToken();
      this.token = authResult.token;

      if (authResult.username) {
        logger.info(`Authenticated as Discord user: ${authResult.username}`);
      }

      // Set up headers
      this.headers = {
        Authorization: this.token,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      // Test the token
      await this.testToken();
    } catch (error) {
      logger.error('Failed to initialize Discord indexer:', error);
      throw error;
    }
  }

  private async testToken(): Promise<void> {
    try {
      const response = await this.fetchWithRetry('https://discord.com/api/v9/users/@me', {
        headers: this.headers,
      });

      const user = await response.json();
      logger.success(`Token validated. Logged in as: ${user.username}#${user.discriminator}`);
    } catch (error) {
      logger.error('Token validation failed:', error);
      throw new Error('Invalid Discord token. Please re-authenticate.');
    }
  }

  private async fetchWithRetry(url: string, options: any): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          // Don't retry on authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (lastError.message.includes('Authentication failed')) {
          throw lastError;
        }

        if (attempt < this.retryAttempts) {
          const delay = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
          logger.warn(
            `Request failed for ${url}, attempt ${attempt}/${this.retryAttempts}. Retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  async indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.info('Starting unified Discord indexing...');

      // Always load state first, regardless of token status
      logger.debug(`[DEBUG] Loading state for Discord ${this.source} indexer - skipExisting: ${this.skipExisting}`);
      await this.stateManager.loadState();
      
      if (this.skipExisting) {
        const processedCount = this.stateManager.getProcessedMessageCount();
        const fileCount = this.stateManager.getProcessedFileCount();
        logger.info(
          `Loaded state: ${processedCount} messages and ${fileCount} files already processed`
        );
      }

      // Try to access channels with existing token first
      if (!this.token) {
        // Check if we have a token from env or cache
        const cachedToken = process.env.DISCORD_TOKEN || (await this.getCachedTokenQuick());
        if (cachedToken) {
          logger.debug('Found existing token, testing channel access...');
          this.setToken(cachedToken);

          // Try to access the first channel
          const testChannelId = this.channels[0];
          const canAccess = await this.testChannelAccess(testChannelId);

          if (!canAccess) {
            logger.warn('Token failed to access channel, re-authenticating...');
            this.token = undefined; // Clear invalid token
            await this.initialize();
          } else {
            logger.success('Existing token works for channel access');
          }
        } else {
          // No token found, need to authenticate
          await this.initialize();
        }
      }

      // Legacy state files are no longer needed - state manager handles everything
      // Migration: Load legacy state into state manager if needed
      await this.migrateFromLegacyState();

      for (let channelIndex = 0; channelIndex < this.channels.length; channelIndex++) {
        const channelId = this.channels[channelIndex];

        progressCallback?.({
          phase: 'scraping',
          source: this.source,
          current: channelIndex,
          total: this.channels.length,
          message: `Fetching channel ${channelIndex + 1}/${this.channels.length}...`,
        });

        const channelMessages = await this.fetchChannelMessages(channelId);

        progressCallback?.({
          phase: 'downloading',
          source: this.source,
          current: 0,
          total: channelMessages.length,
          message: `Processing ${channelMessages.length} messages from channel...`,
        });
        
        logger.debug(`[DEBUG] About to process ${channelMessages.length} messages from channel ${channelId}`);
        logger.debug(`[DEBUG] Current state has ${this.stateManager.getProcessedMessageCount()} processed messages`);

        for (let i = 0; i < channelMessages.length; i++) {
          const message = channelMessages[i];

          try {
            // Check if we should skip this message
            if (this.skipExisting && this.stateManager.isMessageProcessed(message.id)) {
              logger.debug(`[DEBUG] Skipping already processed message: ${message.id}`);
              levelsSkipped++;
              continue;
            }

            // Check if this is a failed message that shouldn't be retried yet
            if (this.skipExisting && !this.stateManager.shouldRetryFailedMessage(message.id)) {
              logger.debug(`[DEBUG] Skipping failed message (retry not due yet): ${message.id}`);
              levelsSkipped++;
              continue;
            }

            logger.debug(`[DEBUG] Processing message ${message.id} - skipExisting: ${this.skipExisting}, isProcessed: ${this.stateManager.isMessageProcessed(message.id)}`);

            const levels = await this.processDiscordMessage(message, channelId);
            for (const level of levels) {
              await this.saveLevelData(level);
              levelsProcessed++;
              logger.info(`Processed Discord level: ${level.metadata.title}`);
            }

            // Mark message as processed
            this.stateManager.markMessageProcessed(message.id);
            this.stateManager.clearFailedMessage(message.id);
          } catch (error) {
            const errorMsg = `Failed to process Discord message ${message.id}: ${error}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            levelsSkipped++;

            // Mark message as failed
            this.stateManager.markMessageFailed(message.id, errorMsg);
          }

          progressCallback?.({
            phase: 'downloading',
            source: this.source,
            current: i + 1,
            total: channelMessages.length,
            message: `Processing message ${i + 1}/${channelMessages.length}...`,
          });
        }

        // Clear message cache after processing each channel to save memory
        this.messageCache.clear();

        // Update last indexed time for this channel
        this.stateManager.updateLastIndexedTime(channelId);
      }

      // Legacy state files no longer needed - state manager handles everything

      // Ensure state manager saves its state
      await this.stateManager.flush();

      logger.success(
        `Discord unified indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );
      
      // Debug summary
      logger.debug(`[DEBUG] Final state summary:`);
      logger.debug(`[DEBUG] - Total messages in state: ${this.stateManager.getProcessedMessageCount()}`);
      logger.debug(`[DEBUG] - Total files in state: ${this.stateManager.getProcessedFileCount()}`);
      logger.debug(`[DEBUG] - skipExisting was: ${this.skipExisting}`);

      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = `Discord unified indexing failed: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);

      // Still save state on error
      await this.stateManager.flush().catch(e => logger.error('Failed to save state:', e));

      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  private async fetchChannelMessages(channelId: string): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];

    try {
      // First, determine channel type
      const channelUrl = `https://discord.com/api/v9/channels/${channelId}`;
      const channelResponse = await this.fetchWithRetry(channelUrl, { headers: this.headers });

      const channelInfo = await channelResponse.json();
      logger.info(`Channel ${channelId} is type: ${channelInfo.type} (${channelInfo.name})`);

      // Type 15 = GUILD_FORUM
      if (channelInfo.type === 15) {
        // Forum channel - fetch threads
        logger.info(`Fetching forum threads for channel ${channelId}...`);

        // Fetch all archived threads with pagination
        let hasMore = true;
        let before: string | undefined;
        let totalThreadCount = 0;

        while (hasMore) {
          const archivedUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100${
            before ? `&before=${before}` : ''
          }`;

          try {
            const archivedResponse = await this.fetchWithRetry(archivedUrl, {
              headers: this.headers,
            });
            const archivedData = await archivedResponse.json();
            const threads: DiscordThread[] = archivedData.threads || [];

            logger.info(`Found ${threads.length} archived threads in this batch`);
            totalThreadCount += threads.length;

            // Process each thread
            for (const thread of threads) {
              // Check if thread is excluded
              if (this.excludedThreads.has(thread.id)) {
                logger.info(`Skipping excluded thread: ${thread.name} (${thread.id})`);
                continue;
              }
              logger.info(`Processing thread: ${thread.name}`);
              const threadMessages = await this.fetchThreadMessages(thread.id);
              messages.push(...threadMessages);
            }

            // Check if there are more threads
            hasMore = archivedData.has_more;

            if (hasMore && threads.length > 0) {
              // Get the last thread's archive timestamp for pagination
              const lastThread = threads[threads.length - 1];
              before = lastThread.thread_metadata.archive_timestamp.replace('+00:00', 'Z');
              logger.info(`Fetching next batch of archived threads...`);
            }
          } catch (error) {
            logger.error(`Failed to fetch archived threads:`, error);
            hasMore = false;
          }
        }

        logger.info(`Total archived threads processed: ${totalThreadCount}`);

        // Try to fetch active threads using search endpoint
        logger.info('Attempting to fetch active (unarchived) threads...');
        try {
          const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=false&limit=25`;
          const searchResponse = await fetch(searchUrl, { headers: this.headers });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const activeThreads: DiscordThread[] = searchData.threads || [];

            logger.info(`Found ${activeThreads.length} active threads via search`);

            for (const thread of activeThreads) {
              // Check if thread is excluded
              if (this.excludedThreads.has(thread.id)) {
                logger.info(`Skipping excluded active thread: ${thread.name} (${thread.id})`);
                continue;
              }
              logger.info(`Processing active thread: ${thread.name}`);
              const threadMessages = await this.fetchThreadMessages(thread.id);
              messages.push(...threadMessages);
            }
          } else {
            logger.warn(`Could not fetch active threads: ${searchResponse.status}`);
          }
        } catch (error) {
          logger.warn('Could not fetch active threads via search endpoint:', error);
        }
      } else if (channelInfo.type === 0 || channelInfo.type === 5) {
        // Regular text channel or news channel
        messages.push(...(await this.fetchTextChannelMessages(channelId)));
      }

      logger.info(`Total messages with .dat/.zip files found: ${messages.length}`);
      return messages;
    } catch (error) {
      logger.error(`Failed to fetch messages for channel ${channelId}:`, error);
      return messages;
    }
  }

  private async fetchTextChannelMessages(channelId: string): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];
    let lastMessageId: string | undefined;
    let hasMore = true;
    let totalFetched = 0;

    while (hasMore) {
      const messagesUrl = `https://discord.com/api/v9/channels/${channelId}/messages?limit=100${
        lastMessageId ? `&before=${lastMessageId}` : ''
      }`;

      try {
        const messagesResponse = await this.fetchWithRetry(messagesUrl, { headers: this.headers });
        const channelMessages: DiscordAPIMessage[] = await messagesResponse.json();

        if (channelMessages.length === 0) {
          hasMore = false;
          break;
        }

        totalFetched += channelMessages.length;
        logger.info(`Fetched ${channelMessages.length} messages (total: ${totalFetched})`);

        // Process messages and cache them
        for (const msg of channelMessages) {
          const message: DiscordMessage = {
            id: msg.id,
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.timestamp,
            channelId,
            attachments: msg.attachments.map(att => ({
              filename: att.filename,
              url: att.url,
              size: att.size,
            })),
          };

          // Cache all messages for association
          this.messageCache.set(msg.id, message);

          const relevantAttachments = msg.attachments.filter(att => {
            const lower = att.filename.toLowerCase();
            return lower.endsWith('.dat') || lower.endsWith('.zip');
          });

          if (relevantAttachments.length > 0) {
            messages.push(message);
          }
        }

        // Set the last message ID for pagination
        lastMessageId = channelMessages[channelMessages.length - 1].id;

        // Stop if we've fetched a lot of messages (safety limit)
        if (totalFetched >= 10000) {
          logger.warn('Reached message fetch limit of 10,000 messages');
          hasMore = false;
        }
      } catch (error) {
        logger.error(`Failed to fetch messages:`, error);
        hasMore = false;
      }
    }

    return messages;
  }

  private async fetchThreadMessages(threadId: string): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];

    try {
      let lastMessageId: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = `https://discord.com/api/v9/channels/${threadId}/messages?limit=100${
          lastMessageId ? `&before=${lastMessageId}` : ''
        }`;

        const response = await this.fetchWithRetry(url, { headers: this.headers });
        const threadMessages: DiscordAPIMessage[] = await response.json();

        if (threadMessages.length === 0) {
          hasMore = false;
          break;
        }

        // Process messages and cache them
        for (const msg of threadMessages) {
          const message: DiscordMessage = {
            id: msg.id,
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.timestamp,
            channelId: threadId,
            attachments: msg.attachments.map(att => ({
              filename: att.filename,
              url: att.url,
              size: att.size,
            })),
          };

          // Cache all messages for association
          this.messageCache.set(msg.id, message);

          const relevantAttachments = msg.attachments.filter(att => {
            const lower = att.filename.toLowerCase();
            return lower.endsWith('.dat') || lower.endsWith('.zip');
          });

          if (relevantAttachments.length > 0) {
            messages.push(message);
          }
        }

        lastMessageId = threadMessages[threadMessages.length - 1].id;
      }

      logger.debug(`Found ${messages.length} messages with .dat/.zip files in thread ${threadId}`);
    } catch (error) {
      logger.error(`Failed to fetch messages for thread ${threadId}:`, error);
    }

    return messages;
  }

  private async processDiscordMessage(
    message: DiscordMessage,
    channelId: string
  ): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      // Separate .dat and .zip files
      const datAttachments = message.attachments.filter(att =>
        att.filename.toLowerCase().endsWith('.dat')
      );
      const zipAttachments = message.attachments.filter(att =>
        att.filename.toLowerCase().endsWith('.zip')
      );

      // Process each .dat file as a level
      for (const datAttachment of datAttachments) {
        // Check if we've already processed this file
        const fileHash = FileUtils.getUrlHash(datAttachment.url);
        logger.debug(`[DEBUG] Checking file ${datAttachment.filename} with hash: ${fileHash}`);
        
        const existingLevelId = this.skipExisting
          ? this.stateManager.getFileLevel(fileHash)
          : undefined;

        if (existingLevelId) {
          logger.info(
            `[DEBUG] Skipping duplicate file ${datAttachment.filename} (already processed as ${existingLevelId})`
          );
          continue;
        } else {
          logger.debug(`[DEBUG] File ${datAttachment.filename} not found in processed files, will process`);
        }

        // Find associated images (from same message and nearby messages)
        const associatedImages = this.findAssociatedImages(message);

        if (associatedImages.length > 0) {
          logger.info(
            `Found ${associatedImages.length} associated image(s) for ${datAttachment.filename}`
          );
        }

        const level = await this.createLevelFromDiscordAttachment(
          datAttachment,
          associatedImages,
          message,
          channelId
        );

        if (level) {
          levels.push(level);
          // Store the hash to avoid duplicates
          this.stateManager.markFileProcessed(fileHash, level.metadata.id);
        }
      }

      // Process each .zip file as a map pack
      for (const zipAttachment of zipAttachments) {
        const fileHash = FileUtils.getUrlHash(zipAttachment.url);
        const existingLevelId = this.skipExisting
          ? this.stateManager.getFileLevel(fileHash)
          : undefined;

        if (existingLevelId) {
          logger.info(
            `Skipping duplicate zip ${zipAttachment.filename} (already processed as ${existingLevelId})`
          );
          continue;
        }

        logger.info(`Processing map pack: ${zipAttachment.filename}`);
        const packLevels = await this.processDiscordZipAttachment(
          zipAttachment,
          message,
          channelId
        );

        levels.push(...packLevels);
        // Store the hash to avoid duplicates
        if (packLevels.length > 0) {
          const packId = `pack-${packLevels[0].metadata.id}`;
          this.stateManager.markFileProcessed(fileHash, packId);
        }
      }

      return levels;
    } catch (error) {
      logger.error(`Failed to process Discord message ${message.id}:`, error);
      return levels;
    }
  }

  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const lowerFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowerFilename.endsWith(ext));
  }

  private findAssociatedImages(message: DiscordMessage): Array<{
    filename: string;
    url: string;
    size: number;
  }> {
    const associatedImages: Array<{ filename: string; url: string; size: number }> = [];

    // First, get images from the same message
    const sameMessageImages = message.attachments.filter(att => this.isImageFile(att.filename));
    associatedImages.push(...sameMessageImages);

    // Look for images in nearby messages (within 5 minutes before and after)
    const messageTime = new Date(message.timestamp).getTime();
    const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Get all cached messages from the same channel
    const channelMessages = Array.from(this.messageCache.values()).filter(
      msg => msg.channelId === message.channelId
    );

    // Sort by timestamp
    channelMessages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Find nearby messages from the same author
    for (const msg of channelMessages) {
      const msgTime = new Date(msg.timestamp).getTime();
      const timeDiff = Math.abs(msgTime - messageTime);

      // Check if message is within time window and from same author
      if (timeDiff <= timeWindow && msg.author === message.author && msg.id !== message.id) {
        const images = msg.attachments.filter(att => this.isImageFile(att.filename));

        // Add images that aren't already included
        for (const img of images) {
          if (!associatedImages.some(existing => existing.url === img.url)) {
            associatedImages.push(img);
            logger.info(`Found associated image ${img.filename} from nearby message ${msg.id}`);
          }
        }
      }
    }

    return associatedImages;
  }

  private async createLevelFromDiscordAttachment(
    datAttachment: {
      filename: string;
      url: string;
      size: number;
    },
    imageAttachments: Array<{
      filename: string;
      url: string;
      size: number;
    }>,
    message: DiscordMessage,
    channelId: string
  ): Promise<Level | null> {
    try {
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(this.source), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = FileUtils.sanitizeFilename(datAttachment.filename);
      const localDatPath = path.join(levelDir, datFileName);

      // Download the .dat file
      await this.downloadFile(datAttachment.url, localDatPath);

      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');

      // Determine channel name based on known channel IDs
      const knownChannels: Record<string, string> = {
        '683985075704299520': 'levels-archive', // OLD text-only archived channel (until July 2023)
        '1139908458968252457': 'community-levels', // CURRENT forum channel (August 2023 onwards, still active)
      };
      const channelName = knownChannels[channelId] || 'unknown-channel';

      // Determine tags based on source
      const tags =
        this.source === MapSource.DISCORD_COMMUNITY
          ? ['discord', 'community', `discord-${channelName}`]
          : ['discord', 'archive', `discord-${channelName}`];

      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: message.author,
        description: message.content || `Level shared on Discord by ${message.author}`,
        postedDate: new Date(message.timestamp),
        source: this.source,
        sourceUrl: `https://discord.com/channels/${channelId}/${message.id}`,
        originalId: message.id,
        tags,
        formatVersion: 'below-v1', // Discord levels are typically below v1
        discordChannelId: channelId,
        discordChannelName: channelName,
      };

      const levelFiles: LevelFile[] = [
        {
          filename: datFileName,
          path: localDatPath,
          size: await FileUtils.getFileSize(localDatPath),
          hash: await FileUtils.getFileHash(localDatPath),
          type: 'dat' as const,
        },
      ];

      // Download associated images
      for (const imageAttachment of imageAttachments) {
        try {
          const imageFileName = FileUtils.sanitizeFilename(imageAttachment.filename);
          const localImagePath = path.join(levelDir, imageFileName);

          logger.info(`Downloading image: ${imageFileName} for level ${levelName}`);
          await this.downloadFile(imageAttachment.url, localImagePath);

          // Determine image type
          const imageType =
            imageFileName.toLowerCase().includes('thumb') ||
            imageFileName.toLowerCase().includes('preview')
              ? 'thumbnail'
              : 'image';

          levelFiles.push({
            filename: imageFileName,
            path: localImagePath,
            size: await FileUtils.getFileSize(localImagePath),
            hash: await FileUtils.getFileHash(localImagePath),
            type: imageType as 'image' | 'thumbnail',
          });

          logger.info(`Downloaded image: ${imageFileName} (${imageType})`);
        } catch (error) {
          logger.warn(`Failed to download image ${imageAttachment.filename}: ${error}`);
          // Continue processing even if image download fails
        }
      }

      const level: Level = {
        metadata,
        files: levelFiles,
        catalogPath: levelDir,
        datFilePath: localDatPath,
        indexed: new Date(),
        lastUpdated: new Date(),
      };

      return level;
    } catch (error) {
      logger.error(
        `Failed to create level from Discord attachment ${datAttachment.filename}:`,
        error
      );
      return null;
    }
  }

  /**
   * Process a Discord zip attachment containing multiple maps
   */
  private async processDiscordZipAttachment(
    zipAttachment: {
      filename: string;
      url: string;
      size: number;
    },
    message: DiscordMessage,
    channelId: string
  ): Promise<Level[]> {
    const levels: Level[] = [];
    const tempDir = path.join(
      this.outputDir,
      '.tmp',
      `discord-zip-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    try {
      await fs.ensureDir(tempDir);
      const zipPath = path.join(tempDir, zipAttachment.filename);

      // Download the zip file
      logger.info(`Downloading zip: ${zipAttachment.filename}`);
      await this.downloadFile(zipAttachment.url, zipPath);

      // Extract level name from zip filename (for pack name)
      const packName = path.basename(zipAttachment.filename, '.zip');

      // Process ZIP entries
      const response = await fetch(zipAttachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download zip: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Track the maps in this pack
      const packMaps: string[] = [];
      let mapIndex = 0;

      // Process ZIP entries directly from the stream
      const zipStream = Readable.from(response.body).pipe(unzipper.Parse());

      await new Promise<void>((resolve, reject) => {
        zipStream.on('entry', async (entry: unzipper.Entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'

          if (type === 'File' && fileName.toLowerCase().endsWith('.dat')) {
            try {
              mapIndex++;
              const levelId = FileUtils.generateUniqueId();
              const levelDir = path.join(this.outputDir, getSourceLevelsDir(this.source), levelId);
              await FileUtils.ensureDir(levelDir);

              const datFileName = FileUtils.sanitizeFilename(path.basename(fileName));
              const localDatPath = path.join(levelDir, datFileName);

              // Save the .dat file
              entry.pipe(fs.createWriteStream(localDatPath));
              await new Promise((resolve, reject) => {
                entry.on('end', resolve);
                entry.on('error', reject);
              });

              // Extract level name from filename
              const levelName = path.basename(datFileName, '.dat');
              packMaps.push(levelName);

              // Determine channel name based on known channel IDs
              const knownChannels: Record<string, string> = {
                '683985075704299520': 'levels-archive', // OLD text-only archived channel (until July 2023)
                '1139908458968252457': 'community-levels', // CURRENT forum channel (August 2023 onwards, still active)
              };
              const channelName = knownChannels[channelId] || 'unknown-channel';

              // Determine tags based on source
              const tags =
                this.source === MapSource.DISCORD_COMMUNITY
                  ? ['discord', 'community', `discord-${channelName}`, 'map-pack', packName]
                  : ['discord', 'archive', `discord-${channelName}`, 'map-pack', packName];

              const metadata: LevelMetadata = {
                id: levelId,
                title: levelName,
                author: message.author,
                description: `From pack: ${packName}\n\n${message.content || `Level pack shared on Discord by ${message.author}`}`,
                postedDate: new Date(message.timestamp),
                source: this.source,
                sourceUrl: `https://discord.com/channels/${channelId}/${message.id}`,
                originalId: `${message.id}-${mapIndex}`,
                tags,
                formatVersion: 'below-v1', // Discord levels are typically below v1
                discordChannelId: channelId,
                discordChannelName: channelName,
              };

              const levelFiles: LevelFile[] = [
                {
                  filename: datFileName,
                  path: localDatPath,
                  size: await FileUtils.getFileSize(localDatPath),
                  hash: await FileUtils.getFileHash(localDatPath),
                  type: 'dat' as const,
                },
              ];

              const level: Level = {
                metadata,
                files: levelFiles,
                catalogPath: levelDir,
                datFilePath: localDatPath,
                indexed: new Date(),
                lastUpdated: new Date(),
              };

              // Save individual catalog
              await FileUtils.writeJSON(path.join(levelDir, 'catalog.json'), level);
              levels.push(level);

              logger.info(`Extracted level from pack: ${levelName} (from ${packName})`);
            } catch (error) {
              logger.error(`Failed to process ${fileName} from zip:`, error);
              entry.autodrain();
            }
          } else {
            entry.autodrain();
          }
        });

        zipStream.on('close', () => {
          logger.info(`Processed ${levels.length} maps from pack: ${packName}`);
          resolve();
        });

        zipStream.on('error', reject);
      });

      // If we have associated images, try to assign them to the first level
      const associatedImages = this.findAssociatedImages(message);
      if (associatedImages.length > 0 && levels.length > 0) {
        logger.info(`Found ${associatedImages.length} image(s) for pack ${packName}`);
        // Download images for the first level in the pack
        for (const img of associatedImages) {
          try {
            const imageFileName = FileUtils.sanitizeFilename(img.filename);
            const imagePath = path.join(path.dirname(levels[0].datFilePath), imageFileName);
            await this.downloadFile(img.url, imagePath);

            levels[0].files.push({
              filename: imageFileName,
              path: imagePath,
              size: img.size,
              type: this.isImageFile(img.filename) ? 'image' : 'other',
            });

            logger.info(`Downloaded pack image: ${imageFileName}`);
          } catch (error) {
            logger.error(`Failed to download pack image ${img.filename}:`, error);
          }
        }
      }

      return levels;
    } catch (error) {
      logger.error(`Failed to process Discord zip ${zipAttachment.filename}:`, error);
      return levels;
    } finally {
      // Clean up temp directory
      try {
        await fs.remove(tempDir);
      } catch (cleanupError) {
        logger.warn(`Failed to clean up temp directory: ${tempDir}`, cleanupError);
      }
    }
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.downloadTimeout);

        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const buffer = await response.buffer();
          await fs.writeFile(filePath, buffer);
          return; // Success!
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error: any) {
        lastError = error as Error;

        // Check if the error was due to timeout
        if (error.name === 'AbortError') {
          lastError = new Error(`Download timeout after ${this.downloadTimeout}ms`);
        }

        if (attempt < this.retryAttempts) {
          const delay = 1000 * attempt;
          logger.warn(
            `Download failed for ${url}, attempt ${attempt}/${this.retryAttempts}. Retrying in ${delay}ms... Error: ${lastError.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Download failed after all retries');
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }

  async clearAuthCache(): Promise<void> {
    await this.discordAuth.clearCache();
  }

  private async getCachedTokenQuick(): Promise<string | null> {
    try {
      const cacheFile = path.join(this.outputDir, '.auth', 'discord-token.json');
      if (await fs.pathExists(cacheFile)) {
        const content = await fs.readFile(cacheFile, 'utf-8');
        const cached = JSON.parse(content);
        return cached.token || null;
      }
    } catch (error) {
      // Ignore errors
    }
    return null;
  }

  private async testChannelAccess(channelId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
        headers: this.headers,
      });

      // 200 means we can access the channel
      // 401/403 means auth failed
      // 404 might mean channel doesn't exist
      return response.ok;
    } catch (error) {
      logger.debug('Channel access test failed:', error);
      return false;
    }
  }

  private async migrateFromLegacyState(): Promise<void> {
    try {
      // Only migrate if state manager is empty
      if (this.stateManager.getProcessedMessageCount() > 0) {
        logger.debug('State manager already has data, skipping migration');
        return;
      }

      const sourceKey = this.source.toLowerCase().replace('_', '-');

      // Try to load legacy processed messages
      const processedPath = path.join(this.outputDir, `${sourceKey}_processed.json`);
      const processed = await FileUtils.readJSON<string[]>(processedPath);

      if (processed && processed.length > 0) {
        logger.info(`Migrating ${processed.length} messages from legacy state...`);
        for (const messageId of processed) {
          this.stateManager.markMessageProcessed(messageId);
        }
      }

      // Try to load legacy hashes
      const hashesPath = path.join(this.outputDir, `${sourceKey}_hashes.json`);
      const hashes = await FileUtils.readJSON<Record<string, string>>(hashesPath);

      if (hashes && Object.keys(hashes).length > 0) {
        logger.info(`Migrating ${Object.keys(hashes).length} file hashes from legacy state...`);
        for (const [hash, levelId] of Object.entries(hashes)) {
          this.stateManager.markFileProcessed(hash, levelId);
        }
      }

      // Save migrated state
      if (processed || hashes) {
        await this.stateManager.flush();
        logger.success('Legacy state migration completed');
      }
    } catch (error) {
      // Migration is optional, don't fail if legacy files don't exist
      logger.debug('No legacy state files found or migration failed:', error);
    }
  }
}
