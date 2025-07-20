import fetch, {
  RequestInit as NodeFetchRequestInit,
  Response as NodeFetchResponse,
} from 'node-fetch';
import {
  DiscordMessage,
  Level,
  LevelFile,
  LevelMetadata,
  MapSource,
  IndexerResult,
  IndexerProgress,
} from '../../types';
import { logger } from '../../utils/logger';
import { FileUtils } from '../../utils/fileUtils';
import { getSourceLevelsDir } from '../../utils/sourceUtils';
import { DiscordAuth } from '../../auth/discordAuth';
import path from 'path';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { DiscordStateManager } from './DiscordStateManager';

// Discord API types
export interface DiscordThread {
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

export interface DiscordAPIMessage {
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

export abstract class DiscordBaseIndexer {
  protected token?: string;
  protected channels: string[];
  protected outputDir: string;
  protected source: MapSource;
  protected headers: Record<string, string> = {};
  protected discordAuth: DiscordAuth;
  protected messageCache: Map<string, DiscordMessage> = new Map();
  protected excludedThreads: Set<string>;
  protected retryAttempts: number;
  protected downloadTimeout: number;
  protected skipExisting: boolean;
  protected stateManager: DiscordStateManager;

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
    logger.debug(
      `[DEBUG] ${this.constructor.name} constructor - skipExisting=${this.skipExisting}, passed value=${skipExisting}`
    );

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
        return;
      }

      // Try to authenticate
      const authResult = await this.discordAuth.getToken();
      if (authResult.token) {
        this.setToken(authResult.token);
        logger.success('Discord authentication successful');
      } else {
        throw new Error('Failed to obtain Discord token');
      }
    } catch (error) {
      logger.error('Discord initialization failed:', error);
      throw error;
    }
  }

  protected async getCachedTokenQuick(): Promise<string | undefined> {
    try {
      const tokenPath = path.join(this.outputDir, '.auth', 'discord-token.json');
      if (await fs.pathExists(tokenPath)) {
        const tokenData = await fs.readJSON(tokenPath);
        return tokenData.token;
      }
    } catch (error) {
      logger.debug('Failed to read cached token:', error);
    }
    return undefined;
  }

  protected async testChannelAccess(channelId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  protected async validateToken(): Promise<void> {
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Token validation failed: ${response.status}`);
      }

      const user = await response.json();
      logger.success(`Token validated. Logged in as: ${user.username}#${user.discriminator}`);
    } catch (error) {
      logger.error('Token validation failed:', error);
      throw new Error('Invalid Discord token. Please re-authenticate.');
    }
  }

  protected async fetchWithRetry(
    url: string,
    options: NodeFetchRequestInit = {}
  ): Promise<NodeFetchResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          // Don't retry on authentication errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication error: ${response.status}`);
          }

          // Create a proper error
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.name = 'HTTPError';
          throw error;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryAttempts) {
          const delay = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
          logger.warn(`Request attempt ${attempt} failed for ${url}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after all attempts');
  }

  protected async migrateFromLegacyState(): Promise<void> {
    // Check if old state files exist
    const sourceName = this.source === MapSource.DISCORD_COMMUNITY ? 'community' : 'archive';
    const oldProcessedPath = path.join(
      this.outputDir,
      '.cache',
      `discord-${sourceName}-processed.json`
    );
    const oldFilesPath = path.join(this.outputDir, '.cache', `discord-${sourceName}-files.json`);

    try {
      let migrated = false;

      // Migrate processed messages
      if (await fs.pathExists(oldProcessedPath)) {
        const oldProcessed = await fs.readJSON(oldProcessedPath);
        if (Array.isArray(oldProcessed)) {
          for (const messageId of oldProcessed) {
            this.stateManager.markMessageProcessed(messageId);
          }
          migrated = true;
          logger.info(`Migrated ${oldProcessed.length} processed messages from legacy state`);
        }
      }

      // Migrate file mappings
      if (await fs.pathExists(oldFilesPath)) {
        const oldFiles = await fs.readJSON(oldFilesPath);
        if (typeof oldFiles === 'object') {
          for (const [fileHash, levelId] of Object.entries(oldFiles)) {
            this.stateManager.markFileProcessed(fileHash, levelId as string);
          }
          migrated = true;
          logger.info(`Migrated ${Object.keys(oldFiles).length} file mappings from legacy state`);
        }
      }

      if (migrated) {
        await this.stateManager.flush();
        // Optionally remove old files after successful migration
        await fs.remove(oldProcessedPath).catch(() => {});
        await fs.remove(oldFilesPath).catch(() => {});
      }
    } catch (error) {
      logger.warn('Legacy state migration failed:', error);
    }
  }

  // Abstract method to be implemented by child classes
  abstract indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult>;

  // Common file processing methods
  protected async processDiscordMessage(
    message: DiscordMessage,
    channelId: string
  ): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      // Extract .dat and .zip files
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
          logger.debug(
            `[DEBUG] File ${datAttachment.filename} not found in processed files, will process`
          );
        }

        // Find associated images (from same message and nearby messages)
        const associatedImages = this.findAssociatedImages(message);

        if (associatedImages.length > 0) {
          logger.info(
            `Found ${associatedImages.length} associated image(s) for ${datAttachment.filename}`
          );
        }

        const level = await this.createLevelFromAttachment(
          datAttachment,
          message,
          channelId,
          associatedImages
        );
        if (level) {
          levels.push(level);
          // Mark file as processed with the level ID
          this.stateManager.markFileProcessed(fileHash, level.metadata.id);
        }
      }

      // Process ZIP files containing multiple levels
      for (const zipAttachment of zipAttachments) {
        // Check if we've already processed this ZIP
        const fileHash = FileUtils.getUrlHash(zipAttachment.url);

        const existingLevelId = this.skipExisting
          ? this.stateManager.getFileLevel(fileHash)
          : undefined;

        if (existingLevelId) {
          logger.debug(
            `Skipping duplicate ZIP ${zipAttachment.filename} (already processed as ${existingLevelId})`
          );
          continue;
        }

        logger.info(`Processing map pack: ${zipAttachment.filename}`);
        const packLevels = await this.processMapPack(
          zipAttachment,
          message,
          channelId,
          zipAttachment.filename.replace(/\.zip$/i, '')
        );
        levels.push(...packLevels);

        // Mark ZIP as processed
        if (packLevels.length > 0) {
          this.stateManager.markFileProcessed(fileHash, `pack-${zipAttachment.filename}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to process Discord message ${message.id}:`, error);
    }

    return levels;
  }

  protected findAssociatedImages(targetMessage: DiscordMessage): DiscordMessage['attachments'] {
    const images: DiscordMessage['attachments'] = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

    // First, check the same message
    const sameMessageImages = targetMessage.attachments.filter(att =>
      imageExtensions.some(ext => att.filename.toLowerCase().endsWith(ext))
    );
    images.push(...sameMessageImages);

    // Then, check nearby messages (within 5 messages before/after)
    const targetTime = new Date(targetMessage.timestamp).getTime();
    const timeWindow = 5 * 60 * 1000; // 5 minutes

    for (const [msgId, msg] of this.messageCache) {
      if (msgId === targetMessage.id) continue;

      const msgTime = new Date(msg.timestamp).getTime();
      if (Math.abs(msgTime - targetTime) <= timeWindow) {
        // Check if this message is from the same author
        if (msg.author.id === targetMessage.author.id) {
          const nearbyImages = msg.attachments.filter(att =>
            imageExtensions.some(ext => att.filename.toLowerCase().endsWith(ext))
          );

          if (nearbyImages.length > 0) {
            logger.info(
              `Found associated image ${nearbyImages[0].filename} from nearby message ${msgId}`
            );
            images.push(...nearbyImages);
          }
        }
      }
    }

    return images;
  }

  protected async createLevelFromAttachment(
    datAttachment: DiscordMessage['attachments'][0],
    message: DiscordMessage,
    channelId: string,
    associatedImages: DiscordMessage['attachments'] = []
  ): Promise<Level | null> {
    try {
      // Generate unique level ID
      const levelId = FileUtils.generateUniqueId();

      // Create level directory
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(this.source), levelId);
      await fs.ensureDir(levelDir);

      // Download the .dat file
      const sanitizedDatName = FileUtils.sanitizeFilename(datAttachment.filename);
      const datPath = path.join(levelDir, sanitizedDatName);
      await this.downloadFile(datAttachment.url, datPath);

      // Create level files array
      const files: LevelFile[] = [
        {
          filename: sanitizedDatName,
          path: datPath,
          size: datAttachment.size,
          type: 'dat',
        },
      ];

      // Download associated images
      for (const imageAtt of associatedImages) {
        try {
          const sanitizedImageName = FileUtils.sanitizeFilename(imageAtt.filename);
          logger.info(
            `Downloading image: ${imageAtt.filename} for level ${datAttachment.filename}`
          );
          const imagePath = path.join(levelDir, sanitizedImageName);
          await this.downloadFile(imageAtt.url, imagePath);

          // Determine image type
          let imageType: 'thumbnail' | 'image' = 'image';
          if (sanitizedImageName.toLowerCase().includes('thumb')) {
            imageType = 'thumbnail';
          }

          files.push({
            filename: sanitizedImageName,
            path: imagePath,
            size: imageAtt.size,
            type: imageType,
          });

          logger.info(`Downloaded image: ${sanitizedImageName} (${imageType})`);
        } catch (error) {
          logger.warn(`Failed to download image ${imageAtt.filename}:`, error);
        }
      }

      // Extract title from filename
      const title = datAttachment.filename.replace(/\.dat$/i, '').replace(/_/g, ' ');

      // Parse author from message or content
      const author = this.parseAuthor(message);

      // Determine channel name based on known channel IDs
      const knownChannels: Record<string, string> = {
        '683985075704299520': 'levels-archive', // OLD text-only archived channel (until July 2023)
        '1139908458968252457': 'community-levels', // CURRENT forum channel (August 2023 onwards, still active)
      };
      const channelName = knownChannels[channelId] || 'unknown-channel';

      // Set appropriate tags based on source
      const tags =
        this.source === MapSource.DISCORD_COMMUNITY
          ? ['discord', 'community', `discord-${channelName}`]
          : ['discord', 'archive', `discord-${channelName}`];

      const metadata: LevelMetadata = {
        id: levelId,
        title,
        author,
        description: message.content || '',
        tags,
        source: this.source,
        sourceUrl: `https://discord.com/channels/@me/${channelId}/${message.id}`,
        originalId: message.id,
        postedDate: new Date(message.timestamp),
      };

      const datFile = files.find(f => f.type === 'dat');
      if (!datFile) {
        throw new Error('No .dat file found in level files');
      }

      return {
        metadata,
        files,
        catalogPath: levelDir,
        datFilePath: datFile.path,
        indexed: new Date(),
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error(`Failed to create level from attachment ${datAttachment.filename}:`, error);
      return null;
    }
  }

  protected parseAuthor(message: DiscordMessage): string {
    // First, try to extract from message content
    const authorMatch = message.content.match(/(?:by|author|made by|created by)[:\s]+([^\n,]+)/i);
    if (authorMatch) {
      return authorMatch[1].trim();
    }

    // Default to Discord username
    return message.author.username;
  }

  protected async downloadFile(url: string, filePath: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.downloadTimeout);

        try {
          const response = await fetch(url, {
            headers: this.headers,
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const buffer = await response.buffer();
          await fs.writeFile(filePath, buffer);
          return; // Success!
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if the error was due to timeout
        if (lastError.name === 'AbortError') {
          lastError = new Error(`Download timeout after ${this.downloadTimeout}ms`);
        }

        if (attempt < this.retryAttempts) {
          const delay = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
          logger.warn(`Download attempt ${attempt} failed for ${url}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Download failed after all attempts');
  }

  protected async processMapPack(
    zipAttachment: DiscordMessage['attachments'][0],
    message: DiscordMessage,
    channelId: string,
    packName: string
  ): Promise<Level[]> {
    const levels: Level[] = [];
    const tempDir = path.join(this.outputDir, '.temp', `discord-pack-${Date.now()}`);

    try {
      await fs.ensureDir(tempDir);

      // Download ZIP file
      logger.info(`Downloading zip: ${zipAttachment.filename}`);
      const sanitizedZipName = FileUtils.sanitizeFilename(zipAttachment.filename);
      const zipPath = path.join(tempDir, sanitizedZipName);
      await this.downloadFile(zipAttachment.url, zipPath);

      // Extract ZIP
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: tempDir }))
          .on('finish', resolve)
          .on('error', reject);
      });

      // Find all .dat files in the extracted content
      const files = await fs.readdir(tempDir, { recursive: true });
      const datFiles = files.filter(
        file => typeof file === 'string' && file.toLowerCase().endsWith('.dat')
      );

      logger.info(`Found ${datFiles.length} levels in pack: ${packName}`);

      for (const datFile of datFiles) {
        if (typeof datFile !== 'string') continue;

        const datPath = path.join(tempDir, datFile);
        const fileHash = await FileUtils.getFileHash(datPath);

        // Check if already processed
        const existingLevelId = this.skipExisting
          ? this.stateManager.getFileLevel(fileHash)
          : undefined;

        if (existingLevelId) {
          logger.debug(
            `Skipping duplicate file from pack: ${datFile} (already processed as ${existingLevelId})`
          );
          continue;
        }

        const baseName = path.basename(datFile);
        const levelId = FileUtils.generateUniqueId();

        // Create level directory
        const levelDir = path.join(this.outputDir, getSourceLevelsDir(this.source), levelId);
        await fs.ensureDir(levelDir);

        // Copy the .dat file
        await fs.copy(datPath, path.join(levelDir, baseName));

        // Extract title from filename
        const title = baseName.replace(/\.dat$/i, '').replace(/_/g, ' ');

        // Parse author from message or content
        const author = this.parseAuthor(message);

        // Determine channel name based on known channel IDs
        const knownChannels: Record<string, string> = {
          '683985075704299520': 'levels-archive', // OLD text-only archived channel (until July 2023)
          '1139908458968252457': 'community-levels', // CURRENT forum channel (August 2023 onwards, still active)
        };
        const channelName = knownChannels[channelId] || 'unknown-channel';

        // Set appropriate tags based on source
        const tags =
          this.source === MapSource.DISCORD_COMMUNITY
            ? ['discord', 'community', `discord-${channelName}`, 'map-pack', packName]
            : ['discord', 'archive', `discord-${channelName}`, 'map-pack', packName];

        const metadata: LevelMetadata = {
          id: levelId,
          title,
          author,
          description: `Part of map pack: ${packName}\n\n${message.content || ''}`,
          tags,
          source: this.source,
          sourceUrl: `https://discord.com/channels/@me/${channelId}/${message.id}`,
          originalId: message.id,
          postedDate: new Date(message.timestamp),
        };

        const datFilePath = path.join(levelDir, baseName);
        const fileStats = await fs.stat(datFilePath);

        const level: Level = {
          metadata,
          files: [
            {
              filename: baseName,
              path: datFilePath,
              size: fileStats.size,
              type: 'dat',
            },
          ],
          catalogPath: levelDir,
          datFilePath,
          indexed: new Date(),
          lastUpdated: new Date(),
        };

        levels.push(level);
        const levelFileHash = await FileUtils.getFileHash(datFilePath);
        this.stateManager.markFileProcessed(levelFileHash, levelId);
        logger.info(`Extracted level from pack: ${baseName} (from ${packName})`);
      }
    } catch (error) {
      logger.error(`Failed to process map pack ${packName}:`, error);
    } finally {
      // Clean up temp directory
      await fs.remove(tempDir).catch(() => {});
    }

    return levels;
  }

  protected async saveLevelData(level: Level): Promise<void> {
    try {
      // Write metadata.json
      const metadataPath = path.join(level.catalogPath, 'metadata.json');
      await fs.writeJSON(metadataPath, level.metadata, { spaces: 2 });

      // Generate README
      const readmePath = path.join(level.catalogPath, 'README.md');
      const readmeContent = this.generateReadme(level);
      await fs.writeFile(readmePath, readmeContent);
    } catch (error) {
      logger.error(`Failed to save level data for ${level.metadata.id}:`, error);
      throw error;
    }
  }

  protected generateReadme(level: Level): string {
    const { metadata, files } = level;

    let readme = `# ${metadata.title}\n\n`;
    readme += `**Author:** ${metadata.author}\n`;
    readme += `**Source:** Discord ${
      this.source === MapSource.DISCORD_COMMUNITY ? 'Community' : 'Archive'
    }\n`;
    readme += `**Posted:** ${new Date(metadata.postedDate).toLocaleDateString()}\n`;
    readme += `**Indexed:** ${new Date(level.indexed).toLocaleDateString()}\n\n`;

    if (metadata.description) {
      readme += `## Description\n\n${metadata.description}\n\n`;
    }

    readme += `## Files\n\n`;
    for (const file of files) {
      readme += `- ${file.filename} (${file.type}`;
      if (file.size) {
        readme += `, ${(file.size / 1024).toFixed(2)} KB`;
      }
      readme += `)\n`;
    }

    if (metadata.tags && metadata.tags.length > 0) {
      readme += `\n## Tags\n\n${metadata.tags.map(tag => `- ${tag}`).join('\n')}\n`;
    }

    return readme;
  }
}
