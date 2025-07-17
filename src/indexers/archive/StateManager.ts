import path from 'path';
import { FileUtils } from '../../utils/fileUtils';
import { logger } from '../../utils/logger';
import { IndexerState } from './types';

interface SavedState {
  lastRun?: string;
  processedItems?: string[];
  failedItems?: Array<[string, string]>;
  cursor?: string;
  totalProcessed?: number;
  totalFailed?: number;
}

export class StateManager {
  private stateFile: string;
  private state: IndexerState;
  private autoSaveInterval?: NodeJS.Timeout;

  constructor(outputDir: string, autoSave = true) {
    this.stateFile = path.join(outputDir, '.cache', 'indexer-state.json');
    this.state = {
      processedItems: new Set(),
      failedItems: new Map(),
      totalProcessed: 0,
      totalFailed: 0,
    };

    if (autoSave) {
      // Auto-save state every 30 seconds
      this.autoSaveInterval = setInterval(() => {
        this.saveState().catch(err => logger.warn('Failed to auto-save state:', err));
      }, 30000);
    }
  }

  async loadState(): Promise<void> {
    try {
      const saved = await FileUtils.readJSON<SavedState>(this.stateFile);
      if (saved) {
        this.state = {
          lastRun: saved.lastRun ? new Date(saved.lastRun) : undefined,
          processedItems: new Set(saved.processedItems || []),
          failedItems: new Map(saved.failedItems || []),
          cursor: saved.cursor,
          totalProcessed: saved.totalProcessed || 0,
          totalFailed: saved.totalFailed || 0,
        };
        logger.info(
          `Loaded state: ${this.state.processedItems.size} processed, ${this.state.failedItems.size} failed`
        );
      }
    } catch (error) {
      logger.info('No previous state found, starting fresh');
    }
  }

  async saveState(): Promise<void> {
    try {
      await FileUtils.ensureDir(path.dirname(this.stateFile));

      const serializable = {
        lastRun: this.state.lastRun?.toISOString(),
        processedItems: Array.from(this.state.processedItems),
        failedItems: Array.from(this.state.failedItems),
        cursor: this.state.cursor,
        totalProcessed: this.state.totalProcessed,
        totalFailed: this.state.totalFailed,
      };

      await FileUtils.writeJSON(this.stateFile, serializable);
      logger.debug('State saved successfully');
    } catch (error) {
      logger.error('Failed to save state:', error);
      throw error;
    }
  }

  isItemProcessed(identifier: string): boolean {
    return this.state.processedItems.has(identifier);
  }

  markItemProcessed(identifier: string): void {
    this.state.processedItems.add(identifier);
    this.state.totalProcessed++;
  }

  markItemFailed(identifier: string, error: string): void {
    this.state.failedItems.set(identifier, error);
    this.state.totalFailed++;
  }

  getFailedItem(identifier: string): string | undefined {
    return this.state.failedItems.get(identifier);
  }

  shouldRetryFailedItem(identifier: string): boolean {
    // Retry failed items after 24 hours
    const failedTime = this.getFailedItemTime(identifier);
    if (!failedTime) return true;

    const hoursSinceFailed = (Date.now() - failedTime) / (1000 * 60 * 60);
    return hoursSinceFailed > 24;
  }

  private getFailedItemTime(_identifier: string): number | null {
    // In a real implementation, we'd store timestamps with failures
    // For now, use last run time as a proxy
    return this.state.lastRun ? this.state.lastRun.getTime() : null;
  }

  updateCursor(cursor: string | undefined): void {
    this.state.cursor = cursor;
  }

  getCursor(): string | undefined {
    return this.state.cursor;
  }

  updateLastRun(): void {
    this.state.lastRun = new Date();
  }

  getLastRun(): Date | undefined {
    return this.state.lastRun;
  }

  getStats() {
    return {
      totalProcessed: this.state.totalProcessed,
      totalFailed: this.state.totalFailed,
      uniqueProcessed: this.state.processedItems.size,
      uniqueFailed: this.state.failedItems.size,
      lastRun: this.state.lastRun,
    };
  }

  async reset(): Promise<void> {
    this.state = {
      processedItems: new Set(),
      failedItems: new Map(),
      totalProcessed: 0,
      totalFailed: 0,
    };

    try {
      await FileUtils.deleteFile(this.stateFile);
      logger.info('State reset successfully');
    } catch (error) {
      logger.warn('Failed to delete state file:', error);
    }
  }

  cleanup(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  async resetFailures(): Promise<void> {
    this.state.failedItems.clear();
    this.state.totalFailed = 0;
    await this.saveState();
    logger.info('Failed items cleared');
  }

  getProcessedItemsList(limit?: number): string[] {
    const items = Array.from(this.state.processedItems);
    return limit ? items.slice(-limit) : items;
  }

  getFailedItemsList(): Array<[string, string]> {
    return Array.from(this.state.failedItems);
  }
}
