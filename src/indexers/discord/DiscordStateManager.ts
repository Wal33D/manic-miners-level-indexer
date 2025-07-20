import { FileUtils } from '../../utils/fileUtils';
import { logger } from '../../utils/logger';
import path from 'path';

interface DiscordState {
  version: number;
  processedMessages: string[];
  processedFiles: Record<string, string>; // hash -> levelId
  lastIndexed: Record<string, string>; // channelId -> ISO timestamp
  failedMessages: Record<string, { error: string; timestamp: string }>;
}

export class DiscordStateManager {
  private stateFile: string;
  private state: DiscordState;
  private hasChanges: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(outputDir: string, sourceName: string) {
    this.stateFile = path.join(outputDir, '.cache', `discord-${sourceName}-state.json`);
    this.state = {
      version: 1,
      processedMessages: [],
      processedFiles: {},
      lastIndexed: {},
      failedMessages: {},
    };
  }

  async loadState(): Promise<void> {
    try {
      logger.debug(`[DEBUG] Loading state from: ${this.stateFile}`);
      const existingState = await FileUtils.readJSON<DiscordState>(this.stateFile);
      if (existingState && existingState.version === 1) {
        this.state = existingState;
        logger.debug(
          `[DEBUG] Loaded Discord state: ${this.state.processedMessages.length} messages processed, ${Object.keys(this.state.processedFiles).length} files tracked`
        );
        // Log first few processed messages for debugging
        if (this.state.processedMessages.length > 0) {
          logger.debug(
            `[DEBUG] Sample processed messages: ${this.state.processedMessages.slice(0, 5).join(', ')}`
          );
        }
      } else if (existingState) {
        logger.warn('Discord state file has incompatible version, starting fresh');
      }
    } catch (error) {
      logger.debug('[DEBUG] No existing Discord state file found, starting fresh');
    }
  }

  async saveState(): Promise<void> {
    if (!this.hasChanges) {
      logger.debug('[DEBUG] No changes to save');
      return;
    }

    try {
      await FileUtils.ensureDir(path.dirname(this.stateFile));
      await FileUtils.writeJSON(this.stateFile, this.state);
      this.hasChanges = false;
      logger.debug(
        `[DEBUG] Discord state saved successfully - ${this.state.processedMessages.length} messages, ${Object.keys(this.state.processedFiles).length} files`
      );
    } catch (error) {
      logger.error('Failed to save Discord state:', error);
    }
  }

  // Schedule a save operation (debounced)
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveState().catch(error => logger.error('Auto-save failed:', error));
    }, 5000); // Save after 5 seconds of inactivity
  }

  isMessageProcessed(messageId: string): boolean {
    const isProcessed = this.state.processedMessages.includes(messageId);
    logger.debug(
      `[DEBUG] Checking if message ${messageId} is processed: ${isProcessed} (total processed: ${this.state.processedMessages.length})`
    );
    return isProcessed;
  }

  isFileProcessed(fileHash: string): boolean {
    const isProcessed = fileHash in this.state.processedFiles;
    logger.debug(`[DEBUG] Checking if file hash ${fileHash} is processed: ${isProcessed}`);
    return isProcessed;
  }

  getFileLevel(fileHash: string): string | undefined {
    const levelId = this.state.processedFiles[fileHash];
    logger.debug(`[DEBUG] Getting level for file hash ${fileHash}: ${levelId || 'not found'}`);
    return levelId;
  }

  markMessageProcessed(messageId: string): void {
    if (!this.state.processedMessages.includes(messageId)) {
      this.state.processedMessages.push(messageId);
      this.hasChanges = true;
      this.scheduleSave();
      logger.debug(
        `[DEBUG] Marked message as processed: ${messageId} (total: ${this.state.processedMessages.length})`
      );
    } else {
      logger.debug(`[DEBUG] Message already marked as processed: ${messageId}`);
    }
  }

  markFileProcessed(fileHash: string, levelId: string): void {
    this.state.processedFiles[fileHash] = levelId;
    this.hasChanges = true;
    this.scheduleSave();
    logger.debug(
      `[DEBUG] Marked file as processed: hash=${fileHash}, levelId=${levelId} (total files: ${Object.keys(this.state.processedFiles).length})`
    );
  }

  getLastIndexedTime(channelId: string): Date | undefined {
    const timestamp = this.state.lastIndexed[channelId];
    return timestamp ? new Date(timestamp) : undefined;
  }

  updateLastIndexedTime(channelId: string, time?: Date): void {
    this.state.lastIndexed[channelId] = (time || new Date()).toISOString();
    this.hasChanges = true;
    this.scheduleSave();
  }

  markMessageFailed(messageId: string, error: string): void {
    this.state.failedMessages[messageId] = {
      error,
      timestamp: new Date().toISOString(),
    };
    this.hasChanges = true;
    this.scheduleSave();
  }

  shouldRetryFailedMessage(messageId: string): boolean {
    const failed = this.state.failedMessages[messageId];
    if (!failed) return true;

    // Retry failed messages after 24 hours
    const failedTime = new Date(failed.timestamp);
    const hoursSinceFailed = (Date.now() - failedTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceFailed >= 24;
  }

  clearFailedMessage(messageId: string): void {
    delete this.state.failedMessages[messageId];
    this.hasChanges = true;
    this.scheduleSave();
  }

  getProcessedMessageCount(): number {
    return this.state.processedMessages.length;
  }

  getProcessedFileCount(): number {
    return Object.keys(this.state.processedFiles).length;
  }

  // Force save any pending changes
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveState();
  }

  // Clear all state (useful for testing or reset)
  async clearState(): Promise<void> {
    this.state = {
      version: 1,
      processedMessages: [],
      processedFiles: {},
      lastIndexed: {},
      failedMessages: {},
    };
    this.hasChanges = true;
    await this.saveState();
  }
}
