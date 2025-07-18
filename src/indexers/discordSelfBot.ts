import { Client, TextChannel, ThreadChannel, NewsChannel, Channel } from 'discord.js-selfbot-v13';
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
import fetch from 'node-fetch';
import chalk from 'chalk';

export class DiscordSelfBot {
  private client: Client;
  private channels: string[];
  private outputDir: string;
  private processedMessages: Set<string> = new Set();
  private isReady: boolean = false;

  constructor(channels: string[], outputDir: string) {
    this.channels = channels;
    this.outputDir = outputDir;
    this.client = new Client();
  }

  async initialize(): Promise<void> {
    const token = process.env.DISCORD_USER_TOKEN;
    if (!token) {
      throw new Error('DISCORD_USER_TOKEN not found in environment variables');
    }

    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        logger.success(`Logged in as ${this.client.user?.tag}`);
        this.isReady = true;
        resolve();
      });

      this.client.on('error', error => {
        logger.error('Discord client error:', error);
      });

      this.client.login(token).catch(error => {
        logger.error('Failed to login:', error);
        reject(error);
      });
    });
  }

  async indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      if (!this.isReady) {
        await this.initialize();
      }

      logger.info('Starting Discord self bot indexing...');

      // Load previously processed messages
      await this.loadProcessedMessages();

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

            const levels = await this.processDiscordMessage(message);
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

      logger.success(
        `Discord self bot indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );

      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = `Discord self bot indexing failed: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);

      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } finally {
      await this.cleanup();
    }
  }

  private async fetchChannelMessages(channelId: string): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel) {
        logger.error(`Channel ${channelId} not found`);
        return messages;
      }

      const channelName = 'name' in channel ? (channel as any).name : channelId;
      logger.info(`Fetching messages from channel: ${channelName}`);

      // For forum channels, we need to fetch threads
      if (channel.type === 'GUILD_FORUM') {
        logger.info('Detected forum channel, fetching posts directly...');

        try {
          // Try to fetch messages directly from the forum channel
          // This approach fetches the forum posts as if they were messages
          const forumChannel = channel as any;

          // Approach 1: Try to get the guild from the channel
          const guildId = forumChannel.guildId || forumChannel.guild?.id;
          const guild = guildId ? this.client.guilds.cache.get(guildId) : null;

          if (!guild) {
            logger.warn('Could not find guild for forum channel');
            return messages;
          }

          logger.info(`Found guild: ${guild.name}`);

          // Approach 2: Fetch all channels and find threads
          const allChannels = await guild.channels.fetch();
          let threadCount = 0;

          // Process all channels to find threads that belong to this forum
          for (const [id, ch] of allChannels) {
            // Check if it's a thread channel
            const isThread = ch && 'parentId' in ch && ch.parentId === channelId;
            if (isThread) {
              const thread = ch as unknown as ThreadChannel;
              threadCount++;
              logger.info(`Processing thread: ${thread.name}`);
              const threadMessages = await this.fetchThreadMessages(thread);
              messages.push(...threadMessages);
            }
          }

          logger.info(`Found ${threadCount} threads in forum channel`);

          // Approach 3: Try the threads manager if available
          if (forumChannel.threads) {
            try {
              // Try different methods to fetch archived threads
              const methods = [
                () => forumChannel.threads.fetchArchived(),
                () => forumChannel.threads.fetchArchived({ limit: 100 }),
                () => forumChannel.threads.fetchArchived({ type: 'public', limit: 100 }),
              ];

              for (const method of methods) {
                try {
                  const result = await method();
                  if (result && result.threads) {
                    logger.info(`Found ${result.threads.size} additional archived threads`);
                    for (const [threadId, thread] of result.threads) {
                      logger.info(`Processing archived thread: ${thread.name}`);
                      const threadMessages = await this.fetchThreadMessages(thread);
                      messages.push(...threadMessages);
                    }
                    break; // If one method works, don't try others
                  }
                } catch (e) {
                  // Try next method
                }
              }
            } catch (error) {
              logger.warn('Could not fetch archived threads with any method');
            }
          }
        } catch (error) {
          logger.error('Error fetching forum threads:', error);
        }
      } else if (channel.type === 'GUILD_TEXT' || channel.type === 'GUILD_NEWS') {
        // Regular text channel - fetch messages directly
        const textChannel = channel as TextChannel | NewsChannel;
        let lastMessageId: string | undefined;
        let fetchedMessages;

        do {
          fetchedMessages = await textChannel.messages.fetch({
            limit: 100,
            before: lastMessageId,
          });

          for (const [messageId, msg] of fetchedMessages) {
            if (msg.attachments.size > 0) {
              const attachments = [];

              for (const [attachmentId, attachment] of msg.attachments) {
                if (attachment.name?.toLowerCase().endsWith('.dat')) {
                  attachments.push({
                    filename: attachment.name,
                    url: attachment.url,
                    size: attachment.size || 0,
                  });
                }
              }

              if (attachments.length > 0) {
                messages.push({
                  id: msg.id,
                  content: msg.content,
                  author: msg.author.username,
                  timestamp: msg.createdAt.toISOString(),
                  attachments,
                });
              }
            }
          }

          lastMessageId = fetchedMessages.last()?.id;
        } while (fetchedMessages.size === 100);
      }

      logger.info(`Found ${messages.length} messages with .dat attachments`);
      return messages;
    } catch (error) {
      logger.error(`Failed to fetch messages from channel ${channelId}:`, error);
      return messages;
    }
  }

  private async fetchThreadMessages(thread: any): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];

    try {
      logger.info(`Fetching messages from thread: ${thread.name}`);

      let lastMessageId: string | undefined;
      let fetchedMessages;

      do {
        fetchedMessages = await thread.messages.fetch({
          limit: 100,
          before: lastMessageId,
        });

        for (const [messageId, msg] of fetchedMessages) {
          if (msg.attachments.size > 0) {
            const attachments = [];

            for (const [attachmentId, attachment] of msg.attachments) {
              if (attachment.name?.toLowerCase().endsWith('.dat')) {
                attachments.push({
                  filename: attachment.name,
                  url: attachment.url,
                  size: attachment.size || 0,
                });
              }
            }

            if (attachments.length > 0) {
              messages.push({
                id: msg.id,
                content: msg.content,
                author: msg.author.username,
                timestamp: msg.createdAt.toISOString(),
                attachments,
              });
            }
          }
        }

        lastMessageId = fetchedMessages.last()?.id;
      } while (fetchedMessages.size === 100);

      return messages;
    } catch (error) {
      logger.error(`Failed to fetch messages from thread ${thread.name}:`, error);
      return messages;
    }
  }

  private async processDiscordMessage(message: DiscordMessage): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      for (const attachment of message.attachments) {
        const level = await this.createLevelFromDiscordAttachment(attachment, message);
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
    message: DiscordMessage
  ): Promise<Level | null> {
    try {
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.DISCORD), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = FileUtils.sanitizeFilename(attachment.filename);
      const localDatPath = path.join(levelDir, datFileName);

      // Download the .dat file
      await this.downloadFile(attachment.url, localDatPath);

      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');

      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: message.author,
        description: message.content || `Level shared on Discord by ${message.author}`,
        postedDate: new Date(message.timestamp),
        source: MapSource.DISCORD,
        sourceUrl: `https://discord.com/channels/${message.id}`,
        originalId: message.id,
        tags: ['discord', 'community', 'selfbot'],
      };

      const levelFiles = [
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

      return level;
    } catch (error) {
      logger.error(`Failed to create level from Discord attachment ${attachment.filename}:`, error);
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
    const processedPath = path.join(this.outputDir, 'discord_selfbot_processed.json');
    const processed = await FileUtils.readJSON<string[]>(processedPath);

    if (processed) {
      this.processedMessages = new Set(processed);
      logger.info(`Loaded ${this.processedMessages.size} previously processed messages`);
    }
  }

  private async saveProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_selfbot_processed.json');
    await FileUtils.writeJSON(processedPath, Array.from(this.processedMessages));
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }

  private async cleanup(): Promise<void> {
    try {
      this.client.destroy();
      logger.info('Discord self bot client disconnected');
    } catch (error) {
      logger.warn('Failed to cleanup Discord client:', error);
    }
  }

  // Monitor channel for new messages (real-time updates)
  async monitorChannel(channelId: string): Promise<void> {
    if (!this.isReady) {
      await this.initialize();
    }

    logger.info(`Starting to monitor channel ${channelId} for new messages...`);

    this.client.on('messageCreate', async message => {
      // Only process messages from the specified channel
      if (message.channelId !== channelId) return;

      // Check if message has .dat attachments
      const hasDataAttachments = message.attachments.some(attachment =>
        attachment.name?.toLowerCase().endsWith('.dat')
      );

      if (!hasDataAttachments) return;

      logger.info(`New message with .dat file detected from ${message.author.username}`);

      const discordMessage: DiscordMessage = {
        id: message.id,
        content: message.content,
        author: message.author.username,
        timestamp: message.createdAt.toISOString(),
        attachments: message.attachments
          .filter(att => att.name?.toLowerCase().endsWith('.dat'))
          .map(att => ({
            filename: att.name!,
            url: att.url,
            size: att.size || 0,
          })),
      };

      try {
        const levels = await this.processDiscordMessage(discordMessage);
        for (const level of levels) {
          await this.saveLevelData(level);
          logger.success(`Processed new Discord level: ${level.metadata.title}`);
        }

        this.processedMessages.add(message.id);
        await this.saveProcessedMessages();
      } catch (error) {
        logger.error(`Failed to process new message ${message.id}:`, error);
      }
    });

    // Keep the bot running
    process.on('SIGINT', async () => {
      logger.info('Shutting down Discord monitor...');
      await this.cleanup();
      process.exit(0);
    });
  }
}
