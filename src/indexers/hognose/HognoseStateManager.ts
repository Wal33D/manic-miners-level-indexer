import { FileUtils } from '../../utils/fileUtils';
import { logger } from '../../utils/logger';
import path from 'path';

interface HognoseState {
  version: number;
  processedReleases: string[]; // tag names
  processedFiles: Record<string, string>; // fileHash -> levelId
  lastIndexed: string; // ISO timestamp
}

export class HognoseStateManager {
  private stateFile: string;
  private state: HognoseState;
  private hasChanges: boolean = false;

  constructor(outputDir: string) {
    this.stateFile = path.join(outputDir, '.cache', 'hognose-state.json');
    this.state = {
      version: 1,
      processedReleases: [],
      processedFiles: {},
      lastIndexed: new Date().toISOString(),
    };
  }

  async loadState(): Promise<void> {
    try {
      const existingState = await FileUtils.readJSON<HognoseState>(this.stateFile);
      if (existingState && existingState.version === 1) {
        this.state = existingState;
        logger.debug(
          `Loaded Hognose state: ${this.state.processedReleases.length} releases processed`
        );
      } else if (existingState) {
        logger.warn('Hognose state file has incompatible version, starting fresh');
      }
    } catch (error) {
      logger.debug('No existing Hognose state file found, starting fresh');
    }
  }

  async saveState(): Promise<void> {
    if (!this.hasChanges) return;

    try {
      await FileUtils.ensureDir(path.dirname(this.stateFile));
      await FileUtils.writeJSON(this.stateFile, this.state);
      this.hasChanges = false;
      logger.debug('Hognose state saved successfully');
    } catch (error) {
      logger.error('Failed to save Hognose state:', error);
    }
  }

  isReleaseProcessed(tagName: string): boolean {
    return this.state.processedReleases.includes(tagName);
  }

  markReleaseProcessed(tagName: string): void {
    if (!this.state.processedReleases.includes(tagName)) {
      this.state.processedReleases.push(tagName);
      this.state.lastIndexed = new Date().toISOString();
      this.hasChanges = true;
    }
  }

  isFileProcessed(fileHash: string): boolean {
    return fileHash in this.state.processedFiles;
  }

  markFileProcessed(fileHash: string, levelId: string): void {
    this.state.processedFiles[fileHash] = levelId;
    this.hasChanges = true;
  }

  getProcessedReleaseCount(): number {
    return this.state.processedReleases.length;
  }

  getProcessedFileCount(): number {
    return Object.keys(this.state.processedFiles).length;
  }

  getLastIndexedTime(): Date {
    return new Date(this.state.lastIndexed);
  }

  // Clear state but keep certain releases (useful for replaceExisting logic)
  clearReleasesExcept(keepReleases: string[]): void {
    // Remove releases not in the keep list
    this.state.processedReleases = this.state.processedReleases.filter(release =>
      keepReleases.includes(release)
    );

    // Clear all file hashes as they might be stale
    this.state.processedFiles = {};
    this.hasChanges = true;
  }

  // Clear all state (useful for testing or reset)
  async clearState(): Promise<void> {
    this.state = {
      version: 1,
      processedReleases: [],
      processedFiles: {},
      lastIndexed: new Date().toISOString(),
    };
    this.hasChanges = true;
    await this.saveState();
  }
}
