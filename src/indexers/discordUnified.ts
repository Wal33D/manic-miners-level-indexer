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
  private processedMessages: Set<string> = new Set();
  private processedHashes: Map<string, string> = new Map();
  private headers: Record<string, string> = {};
  private discordAuth: DiscordAuth;

  constructor(channels: string[], outputDir: string) {
    this.channels = channels;
    this.outputDir = outputDir;
    this.discordAuth = new DiscordAuth(path.join(outputDir, '.auth'));
  }

  async initialize(): Promise<void> {
    try {
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
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Token validation failed: ${response.status} ${response.statusText}`);
      }

      const user = await response.json();
      logger.success(`Token validated. Logged in as: ${user.username}#${user.discriminator}`);
    } catch (error) {
      logger.error('Token validation failed:', error);
      throw new Error('Invalid Discord token. Please re-authenticate.');
    }
  }

  async indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      // Initialize if not already done
      if (!this.token) {
        await this.initialize();
      }

      logger.info('Starting unified Discord indexing...');

      // Load previously processed messages and hashes
      await this.loadProcessedMessages();
      await this.loadProcessedHashes();

      for (let channelIndex = 0; channelIndex < this.channels.length; channelIndex++) {
        const channelId = this.channels[channelIndex];

        progressCallback?.({
          phase: 'scraping',
          source: MapSource.DISCORD,
          current: channelIndex,
          total: this.channels.length,
          message: `Fetching channel ${channelIndex + 1}/${this.channels.length}...`,
        });

        const channelMessages = await this.fetchChannelMessages(channelId);

        progressCallback?.({
          phase: 'downloading',
          source: MapSource.DISCORD,
          current: 0,
          total: channelMessages.length,
          message: `Processing ${channelMessages.length} messages from channel...`,
        });

        for (let i = 0; i < channelMessages.length; i++) {
          const message = channelMessages[i];

          try {
            if (this.processedMessages.has(message.id)) {
              levelsSkipped++;
              continue;
            }

            const levels = await this.processDiscordMessage(message, channelId);
            for (const level of levels) {
              await this.saveLevelData(level);
              levelsProcessed++;
              logger.info(`Processed Discord level: ${level.metadata.title}`);
            }

            this.processedMessages.add(message.id);
          } catch (error) {
            const errorMsg = `Failed to process Discord message ${message.id}: ${error}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            levelsSkipped++;
          }

          progressCallback?.({
            phase: 'downloading',
            source: MapSource.DISCORD,
            current: i + 1,
            total: channelMessages.length,
            message: `Processing message ${i + 1}/${channelMessages.length}...`,
          });
        }
      }

      await this.saveProcessedMessages();
      await this.saveProcessedHashes();

      logger.success(
        `Discord unified indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );

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
      const channelResponse = await fetch(channelUrl, { headers: this.headers });

      if (!channelResponse.ok) {
        logger.error(`Failed to fetch channel info: ${channelResponse.status}`);
        return messages;
      }

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
          const archivedResponse = await fetch(archivedUrl, { headers: this.headers });

          if (archivedResponse.ok) {
            const archivedData = await archivedResponse.json();
            const threads: DiscordThread[] = archivedData.threads || [];

            logger.info(`Found ${threads.length} archived threads in this batch`);
            totalThreadCount += threads.length;

            // Process each thread
            for (const thread of threads) {
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
          } else {
            logger.error(`Failed to fetch archived threads: ${archivedResponse.status}`);
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

      logger.info(`Total messages with .dat files found: ${messages.length}`);
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

      const messagesResponse = await fetch(messagesUrl, { headers: this.headers });

      if (!messagesResponse.ok) {
        logger.error(`Failed to fetch messages: ${messagesResponse.status}`);
        break;
      }

      const channelMessages: DiscordAPIMessage[] = await messagesResponse.json();

      if (channelMessages.length === 0) {
        hasMore = false;
        break;
      }

      totalFetched += channelMessages.length;
      logger.info(`Fetched ${channelMessages.length} messages (total: ${totalFetched})`);

      // Process messages for .dat attachments
      for (const msg of channelMessages) {
        const datAttachments = msg.attachments.filter(att =>
          att.filename.toLowerCase().endsWith('.dat')
        );

        if (datAttachments.length > 0) {
          // Include all attachments (dat files and potential images)
          messages.push({
            id: msg.id,
            author: msg.author.username,
            content: msg.content,
            timestamp: msg.timestamp,
            attachments: msg.attachments.map(att => ({
              filename: att.filename,
              url: att.url,
              size: att.size,
            })),
          });
        }
      }

      // Set the last message ID for pagination
      lastMessageId = channelMessages[channelMessages.length - 1].id;

      // Stop if we've fetched a lot of messages (safety limit)
      if (totalFetched >= 10000) {
        logger.warn('Reached message fetch limit of 10,000 messages');
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

        const response = await fetch(url, { headers: this.headers });

        if (!response.ok) {
          logger.error(`Failed to fetch thread messages: ${response.status}`);
          break;
        }

        const threadMessages: DiscordAPIMessage[] = await response.json();

        if (threadMessages.length === 0) {
          hasMore = false;
          break;
        }

        // Process messages for .dat attachments
        for (const msg of threadMessages) {
          const datAttachments = msg.attachments.filter(att =>
            att.filename.toLowerCase().endsWith('.dat')
          );

          if (datAttachments.length > 0) {
            // Include all attachments (dat files and potential images)
            messages.push({
              id: msg.id,
              author: msg.author.username,
              content: msg.content,
              timestamp: msg.timestamp,
              attachments: msg.attachments.map(att => ({
                filename: att.filename,
                url: att.url,
                size: att.size,
              })),
            });
          }
        }

        lastMessageId = threadMessages[threadMessages.length - 1].id;
      }

      logger.debug(`Found ${messages.length} messages with .dat files in thread ${threadId}`);
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
      // Separate .dat files from images
      const datAttachments = message.attachments.filter(att =>
        att.filename.toLowerCase().endsWith('.dat')
      );
      const imageAttachments = message.attachments.filter(att => this.isImageFile(att.filename));

      // Process each .dat file as a level
      for (const datAttachment of datAttachments) {
        // Check if we've already processed this file
        const fileHash = await FileUtils.getUrlHash(datAttachment.url);
        const existingLevelId = this.processedHashes.get(fileHash);

        if (existingLevelId) {
          logger.info(
            `Skipping duplicate file ${datAttachment.filename} (already processed as ${existingLevelId})`
          );
          continue;
        }

        // Find associated images (images in the same message)
        const associatedImages = imageAttachments;

        const level = await this.createLevelFromDiscordAttachment(
          datAttachment,
          associatedImages,
          message,
          channelId
        );

        if (level) {
          levels.push(level);
          // Store the hash to avoid duplicates
          this.processedHashes.set(fileHash, level.metadata.id);
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
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.DISCORD), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = FileUtils.sanitizeFilename(datAttachment.filename);
      const localDatPath = path.join(levelDir, datFileName);

      // Download the .dat file
      await this.downloadFile(datAttachment.url, localDatPath);

      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');

      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: message.author,
        description: message.content || `Level shared on Discord by ${message.author}`,
        postedDate: new Date(message.timestamp),
        source: MapSource.DISCORD,
        sourceUrl: `https://discord.com/channels/${channelId}/${message.id}`,
        originalId: message.id,
        tags: ['discord', 'community'],
        formatVersion: 'below-v1', // Discord levels are typically below v1
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

  private async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
  }

  private async loadProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_processed.json');
    const processed = await FileUtils.readJSON<string[]>(processedPath);

    if (processed) {
      this.processedMessages = new Set(processed);
    }
  }

  private async saveProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_processed.json');
    await FileUtils.writeJSON(processedPath, Array.from(this.processedMessages));
  }

  private async loadProcessedHashes(): Promise<void> {
    const hashesPath = path.join(this.outputDir, 'discord_hashes.json');
    const hashes = await FileUtils.readJSON<Record<string, string>>(hashesPath);

    if (hashes) {
      this.processedHashes = new Map(Object.entries(hashes));
    }
  }

  private async saveProcessedHashes(): Promise<void> {
    const hashesPath = path.join(this.outputDir, 'discord_hashes.json');
    const hashesObj = Object.fromEntries(this.processedHashes);
    await FileUtils.writeJSON(hashesPath, hashesObj);
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }

  async clearAuthCache(): Promise<void> {
    await this.discordAuth.clearCache();
  }
}
