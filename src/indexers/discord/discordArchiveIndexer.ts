import { MapSource, IndexerResult, IndexerProgress, DiscordMessage } from '../../types';
import { logger } from '../../utils/logger';
import { DiscordBaseIndexer, DiscordAPIMessage } from './discordBase';

export class DiscordArchiveIndexer extends DiscordBaseIndexer {
  constructor(
    channels: string[],
    outputDir: string,
    excludedThreads?: string[],
    retryAttempts?: number,
    downloadTimeout?: number,
    skipExisting?: boolean
  ) {
    super(
      channels,
      outputDir,
      MapSource.DISCORD_ARCHIVE,
      excludedThreads,
      retryAttempts,
      downloadTimeout,
      skipExisting
    );
  }

  async indexDiscord(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.info('Starting Discord Archive indexing...');

      // Always load state first, regardless of token status
      logger.debug(
        `[DEBUG] Loading state for Discord ${this.source} indexer - skipExisting: ${this.skipExisting}`
      );
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

        const channelMessages = await this.fetchTextChannelMessages(channelId);

        progressCallback?.({
          phase: 'downloading',
          source: this.source,
          current: 0,
          total: channelMessages.length,
          message: `Processing ${channelMessages.length} messages from channel...`,
        });

        logger.debug(
          `[DEBUG] About to process ${channelMessages.length} messages from channel ${channelId}`
        );
        logger.debug(
          `[DEBUG] Current state has ${this.stateManager.getProcessedMessageCount()} processed messages`
        );

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

            logger.debug(
              `[DEBUG] Processing message ${message.id} - skipExisting: ${this.skipExisting}, isProcessed: ${this.stateManager.isMessageProcessed(message.id)}`
            );

            const levels = await this.processDiscordMessage(message, channelId);
            for (const level of levels) {
              await this.saveLevelData(level);
              levelsProcessed++;
              logger.info(`Processed Discord level: ${level.metadata.title}`);
            }

            // Mark message as processed even if no levels were found
            // This prevents re-checking messages without .dat files
            this.stateManager.markMessageProcessed(message.id);

            progressCallback?.({
              phase: 'downloading',
              source: this.source,
              current: i + 1,
              total: channelMessages.length,
              message: `Processing message ${i + 1}/${channelMessages.length}...`,
            });
          } catch (error) {
            const errorMsg = `Failed to process message ${message.id}: ${error}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            this.stateManager.markMessageFailed(message.id, String(error));
          }
        }

        // Update last indexed time for this channel
        this.stateManager.updateLastIndexedTime(channelId);
      }

      // Ensure state manager saves its state
      await this.stateManager.flush();

      logger.success(
        `Discord Archive indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );

      // Debug summary
      logger.debug(`[DEBUG] Final state summary:`);
      logger.debug(
        `[DEBUG] - Total messages in state: ${this.stateManager.getProcessedMessageCount()}`
      );
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
      logger.error('Discord Archive indexing failed:', error);
      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
        duration: Date.now() - startTime,
      };
    }
  }

  private async fetchTextChannelMessages(channelId: string): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];
    this.messageCache.clear(); // Clear cache for new channel

    try {
      // Validate token first
      await this.validateToken();

      // Check channel type
      const channelResponse = await this.fetchWithRetry(
        `https://discord.com/api/v9/channels/${channelId}`,
        {
          headers: this.headers,
        }
      );

      const channelInfo = await channelResponse.json();
      logger.info(`Channel ${channelId} is type: ${channelInfo.type} (${channelInfo.name})`);

      // Type 0 = GUILD_TEXT, Type 5 = GUILD_NEWS
      if (channelInfo.type !== 0 && channelInfo.type !== 5) {
        logger.warn(`Channel ${channelId} is not a text channel (type: ${channelInfo.type})`);
        return messages;
      }

      // Regular text channel - fetch messages directly
      let hasMore = true;
      let lastMessageId: string | undefined;

      while (hasMore) {
        const url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=100${
          lastMessageId ? `&before=${lastMessageId}` : ''
        }`;

        const response = await this.fetchWithRetry(url, { headers: this.headers });
        const channelMessages: DiscordAPIMessage[] = await response.json();

        if (channelMessages.length === 0) {
          hasMore = false;
          break;
        }

        logger.info(`Fetched ${channelMessages.length} messages (total: ${messages.length})`);

        // Process messages and cache them
        for (const msg of channelMessages) {
          const message: DiscordMessage = {
            id: msg.id,
            author: msg.author,
            content: msg.content,
            timestamp: msg.timestamp,
            channelId,
            attachments: msg.attachments.map(att => ({
              filename: att.filename,
              size: att.size,
              url: att.url,
            })),
          };

          // Cache all messages for image association
          this.messageCache.set(message.id, message);

          // Only include messages with .dat or .zip files
          const hasLevelFiles = message.attachments.some(
            att =>
              att.filename.toLowerCase().endsWith('.dat') ||
              att.filename.toLowerCase().endsWith('.zip')
          );

          if (hasLevelFiles) {
            messages.push(message);
          }
        }

        lastMessageId = channelMessages[channelMessages.length - 1].id;
      }

      logger.info(`Total messages with .dat/.zip files found: ${messages.length}`);
    } catch (error) {
      logger.error(`Failed to fetch messages from channel ${channelId}:`, error);
      throw error;
    }

    return messages;
  }
}
