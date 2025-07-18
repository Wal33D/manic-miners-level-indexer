import fetch from 'node-fetch';
import {
  DiscordMessage,
  Level,
  LevelMetadata,
  MapSource,
  IndexerResult,
  IndexerProgress,
} from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { getSourceLevelsDir } from '../utils/sourceUtils';
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

export class DiscordDirectAPI {
  private token: string;
  private channels: string[];
  private outputDir: string;
  private processedMessages: Set<string> = new Set();
  private processedHashes: Map<string, string> = new Map(); // hash -> levelId
  private headers: Record<string, string>;

  constructor(channels: string[], outputDir: string) {
    this.channels = channels;
    this.outputDir = outputDir;

    const token = process.env.DISCORD_USER_TOKEN;
    if (!token) {
      throw new Error('DISCORD_USER_TOKEN not found in environment variables');
    }

    this.token = token;
    this.headers = {
      Authorization: token,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.info('Starting Discord direct API indexing...');

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
        `Discord direct API indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );

      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = `Discord direct API indexing failed: ${error}`;
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

      // Type 15 = GUILD_FORUM, Type 0 = GUILD_TEXT
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
              // Clean the timestamp format for Discord API
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

          logger.info(`Active threads search response: ${searchResponse.status}`);

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
            const errorText = await searchResponse.text();
            logger.warn(`Could not fetch active threads: ${searchResponse.status} - ${errorText}`);
          }
        } catch (error) {
          logger.warn('Could not fetch active threads via search endpoint:', error);
        }
      } else if (channelInfo.type === 0 || channelInfo.type === 5) {
        // Regular text channel (0) or news channel (5) - fetch messages directly
        logger.info(`Fetching messages from text channel ${channelId}...`);

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
              messages.push({
                id: msg.id,
                content: msg.content,
                author: msg.author.username,
                timestamp: msg.timestamp,
                channelId,
                attachments: datAttachments.map(att => ({
                  filename: att.filename,
                  url: att.url,
                  size: att.size,
                })),
              });
            }
          }

          lastMessageId = channelMessages[channelMessages.length - 1]?.id;
          hasMore = channelMessages.length === 100;
        }

        logger.info(`Total messages fetched from text channel: ${totalFetched}`);
        logger.info(`Messages with .dat files: ${messages.length}`);
      } else {
        logger.warn(`Unsupported channel type: ${channelInfo.type}`);
      }

      logger.info(`Total messages with .dat files found: ${messages.length}`);
      return messages;
    } catch (error) {
      logger.error(`Failed to fetch channel messages:`, error);
      return messages;
    }
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
          logger.error(`Failed to fetch messages for thread ${threadId}: ${response.status}`);
          break;
        }

        const apiMessages: DiscordAPIMessage[] = await response.json();

        if (apiMessages.length === 0) {
          hasMore = false;
          break;
        }

        // Process messages for .dat attachments
        for (const msg of apiMessages) {
          const datAttachments = msg.attachments.filter(att =>
            att.filename.toLowerCase().endsWith('.dat')
          );

          if (datAttachments.length > 0) {
            messages.push({
              id: msg.id,
              content: msg.content,
              author: msg.author.username,
              timestamp: msg.timestamp,
              channelId: threadId,
              attachments: datAttachments.map(att => ({
                filename: att.filename,
                url: att.url,
                size: att.size,
              })),
            });
          }
        }

        lastMessageId = apiMessages[apiMessages.length - 1]?.id;
        hasMore = apiMessages.length === 100;
      }

      return messages;
    } catch (error) {
      logger.error(`Failed to fetch messages for thread ${threadId}:`, error);
      return messages;
    }
  }

  private async processDiscordMessage(
    message: DiscordMessage,
    channelId: string
  ): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      for (const attachment of message.attachments) {
        const level = await this.createLevelFromDiscordAttachment(attachment, message, channelId);
        if (level) {
          levels.push(level);
        }
      }

      return levels;
    } catch (error) {
      logger.error(`Failed to process Discord message ${message.id}:`, error);
      return levels;
    }
  }

  private async createLevelFromDiscordAttachment(
    attachment: {
      filename: string;
      url: string;
      size: number;
    },
    message: DiscordMessage,
    channelId: string
  ): Promise<Level | null> {
    try {
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.DISCORD), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = FileUtils.sanitizeFilename(attachment.filename);
      const localDatPath = path.join(levelDir, datFileName);

      // Download the .dat file
      await this.downloadFile(attachment.url, localDatPath);

      // Calculate file hash for duplicate detection
      const fileHash = await FileUtils.getFileHash(localDatPath);

      // Check if this file has been processed before
      if (this.processedHashes.has(fileHash)) {
        const existingLevelId = this.processedHashes.get(fileHash)!;
        logger.info(`Duplicate file detected: ${attachment.filename} (hash: ${fileHash})`);
        logger.info(`Already exists as level ID: ${existingLevelId}`);

        // Clean up the downloaded file
        await fs.remove(levelDir);
        return null;
      }

      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');

      // Get actual file size
      const fileSize = await FileUtils.getFileSize(localDatPath);

      // Construct proper Discord URL
      const guildId = '580269696369164299'; // Manic Miners Discord guild ID
      const sourceUrl = `https://discord.com/channels/${guildId}/${channelId}/${message.id}`;

      // Determine if this is a pre-v1 level based on channel
      const isArchiveChannel = channelId === '683985075704299520';
      const formatVersion = isArchiveChannel ? 'below-v1' : 'v1';

      // Parse description and extract additional info
      const { description, extractedTags } = this.parseDiscordMessage(message.content || '');

      // Build appropriate tags
      const tags = ['discord', 'community', 'direct-api', ...extractedTags];
      if (isArchiveChannel) {
        tags.push('pre-v1', 'archive');
      } else {
        tags.push('v1+', 'forum');
      }

      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: message.author,
        description: description || `Level shared on Discord by ${message.author}`,
        postedDate: new Date(message.timestamp),
        source: MapSource.DISCORD,
        sourceUrl,
        originalId: message.id,
        fileSize,
        formatVersion: formatVersion as 'below-v1' | 'v1',
        tags: [...new Set(tags)], // Remove duplicates
      };

      const levelFiles = [
        {
          filename: datFileName,
          path: localDatPath,
          size: fileSize,
          hash: fileHash,
          type: 'dat' as const,
        },
      ];

      // Store the hash for future duplicate detection
      this.processedHashes.set(fileHash, levelId);

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
      logger.error(`Failed to create level from Discord attachment ${attachment.filename}:`, error);
      return null;
    }
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
  }

  private async loadProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_direct_processed.json');
    const processed = await FileUtils.readJSON<string[]>(processedPath);

    if (processed) {
      this.processedMessages = new Set(processed);
      logger.info(`Loaded ${this.processedMessages.size} previously processed messages`);
    }
  }

  private async saveProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_direct_processed.json');
    await FileUtils.writeJSON(processedPath, Array.from(this.processedMessages));
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }

  private async loadProcessedHashes(): Promise<void> {
    const hashesPath = path.join(this.outputDir, 'discord_processed_hashes.json');
    const hashes = await FileUtils.readJSON<Record<string, string>>(hashesPath);

    if (hashes) {
      this.processedHashes = new Map(Object.entries(hashes));
      logger.info(`Loaded ${this.processedHashes.size} file hashes for duplicate detection`);
    }
  }

  private async saveProcessedHashes(): Promise<void> {
    const hashesPath = path.join(this.outputDir, 'discord_processed_hashes.json');
    const hashesObject = Object.fromEntries(this.processedHashes);
    await FileUtils.writeJSON(hashesPath, hashesObject);
  }

  private parseDiscordMessage(content: string): { description: string; extractedTags: string[] } {
    if (!content) {
      return { description: '', extractedTags: [] };
    }

    const extractedTags: string[] = [];
    let cleanedDescription = content;

    // Extract hashtags
    const hashtagRegex = /#(\w+)/g;
    const hashtags = content.match(hashtagRegex);
    if (hashtags) {
      hashtags.forEach(tag => {
        const cleanTag = tag.substring(1).toLowerCase();
        if (cleanTag.length > 2 && cleanTag.length < 20) {
          extractedTags.push(cleanTag);
        }
      });
    }

    // Look for difficulty indicators
    const difficultyRegex = /\b(easy|medium|hard|extreme|beginner|advanced|expert|impossible)\b/gi;
    const difficulties = content.match(difficultyRegex);
    if (difficulties) {
      difficulties.forEach(diff => {
        extractedTags.push(diff.toLowerCase());
      });
    }

    // Look for gameplay type indicators
    const gameplayRegex =
      /\b(puzzle|combat|speedrun|survival|exploration|tutorial|campaign|multiplayer|coop|co-op)\b/gi;
    const gameplayTypes = content.match(gameplayRegex);
    if (gameplayTypes) {
      gameplayTypes.forEach(type => {
        extractedTags.push(type.toLowerCase().replace('-', ''));
      });
    }

    // Look for theme indicators
    const themeRegex =
      /\b(lava|water|ice|crystal|monster|slug|cave|mining|rescue|defense|defence)\b/gi;
    const themes = content.match(themeRegex);
    if (themes) {
      themes.forEach(theme => {
        extractedTags.push(theme.toLowerCase());
      });
    }

    // Clean up the description
    // Remove Discord markdown spoiler tags
    cleanedDescription = cleanedDescription.replace(/\|\|(.+?)\|\|/g, '[SPOILER: $1]');

    // Remove excessive newlines
    cleanedDescription = cleanedDescription.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace
    cleanedDescription = cleanedDescription.trim();

    // Limit description length
    if (cleanedDescription.length > 1000) {
      cleanedDescription = `${cleanedDescription.substring(0, 997)}...`;
    }

    return {
      description: cleanedDescription,
      extractedTags: [...new Set(extractedTags)], // Remove duplicates
    };
  }
}
