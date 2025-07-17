import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { FileUtils } from '../../utils/fileUtils';
import { DownloadTask } from './types';
import pLimit from 'p-limit';
import { EventEmitter } from 'events';

interface DownloadProgress {
  taskId: string;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number; // bytes per second
}

export class DownloadManager extends EventEmitter {
  private queue: DownloadTask[] = [];
  private active = new Map<string, AbortController>();
  private completed = new Set<string>();
  private failed = new Map<string, string>();
  private downloadLimit: ReturnType<typeof pLimit>;
  private bandwidthLimit?: number;
  private lastBandwidthCheck = Date.now();
  private bytesDownloadedInWindow = 0;

  constructor(
    private concurrentDownloads: number = 5,
    private retryAttempts: number = 3,
    private downloadTimeout: number = 60000,
    bandwidthLimit?: number
  ) {
    super();
    this.downloadLimit = pLimit(concurrentDownloads);
    this.bandwidthLimit = bandwidthLimit;
  }

  addTask(task: DownloadTask): void {
    // Check if already queued or completed
    const taskId = this.getTaskId(task);
    if (this.completed.has(taskId) || this.queue.some(t => this.getTaskId(t) === taskId)) {
      logger.debug(`Task already queued or completed: ${taskId}`);
      return;
    }

    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  async processQueue(): Promise<void> {
    const promises: Promise<void>[] = [];

    while (this.queue.length > 0 || this.active.size > 0) {
      // Start new downloads up to the limit
      while (this.queue.length > 0 && this.active.size < this.concurrentDownloads) {
        const task = this.queue.shift();
        if (task) {
          promises.push(this.downloadLimit(() => this.downloadFile(task)));
        }
      }

      // Wait for at least one download to complete before continuing
      if (promises.length > 0) {
        await Promise.race(promises.filter(p => p !== undefined));
      }

      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for all remaining downloads
    await Promise.all(promises);
  }

  private async downloadFile(task: DownloadTask): Promise<void> {
    const taskId = this.getTaskId(task);
    const controller = new AbortController();
    this.active.set(taskId, controller);

    try {
      // Check if file already exists and is valid
      if (await this.isFileValid(task)) {
        logger.debug(`File already exists and is valid: ${task.localPath}`);
        this.completed.add(taskId);
        this.emit('completed', task);
        return;
      }

      // Ensure directory exists
      await FileUtils.ensureDir(path.dirname(task.localPath));

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= task.retries; attempt++) {
        try {
          await this.downloadWithProgress(task, controller.signal);

          // Verify the download
          if (await this.verifyDownload(task)) {
            this.completed.add(taskId);
            this.emit('completed', task);
            return;
          } else {
            throw new Error('Download verification failed');
          }
        } catch (error) {
          lastError = error as Error;
          if (attempt < task.retries) {
            logger.warn(`Download attempt ${attempt} failed for ${task.file.name}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      throw lastError || new Error('Download failed after all retries');
    } catch (error) {
      const errorMsg = `Failed to download ${task.file.name}: ${error}`;
      logger.error(errorMsg);
      this.failed.set(taskId, errorMsg);
      this.emit('failed', task, error);

      // Clean up partial download
      await this.cleanupPartialDownload(task.localPath);
    } finally {
      this.active.delete(taskId);
    }
  }

  private async downloadWithProgress(task: DownloadTask, signal: AbortSignal): Promise<void> {
    const timeout = setTimeout(() => {
      const controller = this.active.get(this.getTaskId(task));
      controller?.abort();
    }, this.downloadTimeout);

    try {
      const headers = await this.getResumeHeaders(task.localPath);
      const response = await fetch(task.url, {
        signal,
        headers: {
          'User-Agent': 'ManicMinersIndexer/2.0',
          ...headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const totalBytes = parseInt(response.headers.get('content-length') || '0');
      const isResume = response.status === 206;

      // Handle resume
      const writeStream = fs.createWriteStream(task.localPath, {
        flags: isResume ? 'a' : 'w',
      });

      let downloadedBytes = isResume ? (await FileUtils.getFileStats(task.localPath)).size : 0;
      let lastProgressUpdate = Date.now();

      await new Promise<void>((resolve, reject) => {
        if (!response.body) {
          reject(new Error('No response body'));
          return;
        }

        response.body.on('data', async (chunk: Buffer) => {
          // Apply bandwidth limiting
          if (this.bandwidthLimit) {
            await this.throttleBandwidth(chunk.length);
          }

          downloadedBytes += chunk.length;

          // Emit progress updates
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) {
            const progress: DownloadProgress = {
              taskId: this.getTaskId(task),
              bytesDownloaded: downloadedBytes,
              totalBytes,
              speed: chunk.length / ((now - lastProgressUpdate) / 1000),
            };
            this.emit('progress', progress);
            lastProgressUpdate = now;
          }
        });

        response.body.pipe(writeStream);
        response.body.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throttleBandwidth(bytes: number): Promise<void> {
    if (!this.bandwidthLimit) return;

    const now = Date.now();
    const windowSize = 1000; // 1 second window

    if (now - this.lastBandwidthCheck > windowSize) {
      this.bytesDownloadedInWindow = 0;
      this.lastBandwidthCheck = now;
    }

    this.bytesDownloadedInWindow += bytes;

    if (this.bytesDownloadedInWindow > this.bandwidthLimit) {
      const delay = windowSize - (now - this.lastBandwidthCheck);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private async getResumeHeaders(filePath: string): Promise<Record<string, string>> {
    try {
      if (await FileUtils.fileExists(filePath)) {
        const stats = await FileUtils.getFileStats(filePath);
        if (stats.size > 0) {
          return { Range: `bytes=${stats.size}-` };
        }
      }
    } catch {
      // File doesn't exist, start from beginning
    }
    return {};
  }

  private async isFileValid(task: DownloadTask): Promise<boolean> {
    try {
      if (!(await FileUtils.fileExists(task.localPath))) {
        return false;
      }

      const stats = await FileUtils.getFileStats(task.localPath);

      // Check file size
      if (task.file.size) {
        const expectedSize = parseInt(task.file.size);
        if (stats.size !== expectedSize) {
          return false;
        }
      }

      // Check checksum if available
      if (task.file.md5) {
        const hash = await this.calculateFileHash(task.localPath, 'md5');
        return hash === task.file.md5.toLowerCase();
      }

      // If no size or checksum, assume valid if file exists
      return stats.size > 0;
    } catch {
      return false;
    }
  }

  private async verifyDownload(task: DownloadTask): Promise<boolean> {
    try {
      const stats = await FileUtils.getFileStats(task.localPath);

      // Basic size check
      if (stats.size === 0) {
        return false;
      }

      // Verify checksum if available
      if (task.file.md5) {
        const hash = await this.calculateFileHash(task.localPath, 'md5');
        if (hash !== task.file.md5.toLowerCase()) {
          logger.warn(
            `Checksum mismatch for ${task.file.name}: expected ${task.file.md5}, got ${hash}`
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Failed to verify download:`, error);
      return false;
    }
  }

  private async calculateFileHash(filePath: string, algorithm: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async cleanupPartialDownload(filePath: string): Promise<void> {
    try {
      await FileUtils.deleteFile(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  private getTaskId(task: DownloadTask): string {
    return `${task.itemId}:${task.file.name}`;
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.active.size,
      completed: this.completed.size,
      failed: this.failed.size,
      failedTasks: Array.from(this.failed.entries()),
    };
  }

  abort(): void {
    // Abort all active downloads
    for (const controller of this.active.values()) {
      controller.abort();
    }

    // Clear the queue
    this.queue = [];

    logger.info('Download manager aborted');
  }
}
