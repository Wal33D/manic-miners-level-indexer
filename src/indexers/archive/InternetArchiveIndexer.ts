import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { FileUtils } from '../../utils/fileUtils';
import { getSourceLevelsDir } from '../../utils/sourceUtils';
import {
  Level,
  LevelMetadata,
  MapSource,
  IndexerProgress,
  IndexerResult,
  LevelFile,
} from '../../types';
import {
  ArchiveIndexerConfig,
  ArchiveMetadata,
  ArchiveItemDetails,
  ArchiveSearchOptions,
  ArchiveFile,
} from './types';
import { MetadataFetcher } from './MetadataFetcher';
import { DownloadManager } from './DownloadManager';
import { StateManager } from './StateManager';
import pLimit from 'p-limit';

export class InternetArchiveIndexer extends EventEmitter {
  private config: ArchiveIndexerConfig;
  private outputDir: string;
  private metadataFetcher: MetadataFetcher;
  private downloadManager: DownloadManager;
  private stateManager: StateManager;
  private abortController: AbortController;
  private processLimit: ReturnType<typeof pLimit>;

  constructor(config: ArchiveIndexerConfig, outputDir: string) {
    super();
    this.config = this.validateConfig(config);
    this.outputDir = outputDir;
    this.abortController = new AbortController();

    // Initialize components
    this.metadataFetcher = new MetadataFetcher(
      outputDir,
      config.enableCache ?? true,
      config.cacheExpiry ?? 86400
    );

    this.downloadManager = new DownloadManager(
      config.maxConcurrentDownloads ?? 10,
      config.retryAttempts ?? 3,
      config.downloadTimeout ?? 60000,
      config.bandwidthLimit
    );

    this.stateManager = new StateManager(outputDir);

    // Limit concurrent item processing
    this.processLimit = pLimit(config.maxConcurrentProcessing ?? 5);

    // Set up event forwarding
    this.setupEventHandlers();
  }

  private validateConfig(config: ArchiveIndexerConfig): ArchiveIndexerConfig {
    return {
      ...config,
      searchQueries: config.searchQueries || ['manic miners level'],
      maxConcurrentProcessing: config.maxConcurrentProcessing ?? 5,
      maxConcurrentDownloads: config.maxConcurrentDownloads ?? 10,
      enableCache: config.enableCache ?? true,
      cacheExpiry: config.cacheExpiry ?? 86400,
      retryAttempts: config.retryAttempts ?? 3,
      downloadTimeout: config.downloadTimeout ?? 60000,
      skipExisting: config.skipExisting ?? true,
      verifyChecksums: config.verifyChecksums ?? true,
    };
  }

  private setupEventHandlers(): void {
    this.downloadManager.on('progress', progress => {
      this.emit('downloadProgress', progress);
    });

    this.downloadManager.on('completed', task => {
      this.emit('fileDownloaded', task);
    });

    this.downloadManager.on('failed', (task, error) => {
      this.emit('downloadFailed', task, error);
    });
  }

  async indexArchive(
    progressCallback?: (progress: IndexerProgress) => void
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.section('Archive.org Indexer (V2 - Streaming Mode)');

      // Load previous state
      await this.stateManager.loadState();
      const stats = this.stateManager.getStats();
      logger.item(`Resuming from: ${stats.uniqueProcessed} items already processed`);

      const searchOptions: ArchiveSearchOptions = {
        queries: this.config.searchQueries || ['manic miners level'],
        dateRange: this.config.dateRange,
        fields: ['identifier', 'title', 'creator', 'date', 'description'],
        sorts: ['downloads desc', 'date desc'],
      };

      let totalItems = 0;
      let processedInBatch = 0;
      const processingPromises: Promise<void>[] = [];

      // Process items in streaming fashion
      for await (const batch of this.metadataFetcher.fetchWithScrapeAPI(searchOptions)) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing aborted');
        }

        totalItems += batch.length;

        progressCallback?.({
          phase: 'indexing',
          source: MapSource.INTERNET_ARCHIVE,
          current: processedInBatch,
          total: totalItems,
          message: `Processing archive items...`,
        });

        // Process each item in the batch concurrently
        for (const item of batch) {
          // Skip if already processed
          if (this.config.skipExisting && this.stateManager.isItemProcessed(item.identifier)) {
            levelsSkipped++;
            processedInBatch++;
            continue;
          }

          // Check if it's a failed item that should be retried
          if (this.stateManager.getFailedItem(item.identifier)) {
            if (!this.stateManager.shouldRetryFailedItem(item.identifier)) {
              levelsSkipped++;
              processedInBatch++;
              continue;
            }
          }

          // Process item with concurrency limit
          const processPromise = this.processLimit(async () => {
            try {
              const processed = await this.processCompleteItem(item);
              if (processed) {
                levelsProcessed++;
                this.stateManager.markItemProcessed(item.identifier);
                logger.item(`${item.title}`, '✓');
              } else {
                levelsSkipped++;
              }
            } catch (error) {
              const errorMsg = `Failed to process ${item.identifier}: ${error}`;
              errors.push(errorMsg);
              this.stateManager.markItemFailed(item.identifier, errorMsg);
              logger.error(errorMsg);
            } finally {
              processedInBatch++;

              // Update progress
              progressCallback?.({
                phase: 'indexing',
                source: MapSource.INTERNET_ARCHIVE,
                current: processedInBatch,
                total: totalItems,
                message: `Processed ${processedInBatch}/${totalItems} items`,
              });
            }
          });

          processingPromises.push(processPromise);
        }

        // Save state periodically
        if (processedInBatch % 50 === 0) {
          await this.stateManager.saveState();
        }
      }

      // Wait for all processing to complete
      await Promise.all(processingPromises);

      // Update state
      this.stateManager.updateLastRun();
      await this.stateManager.saveState();

      const finalStats = this.stateManager.getStats();
      logger.success(
        `Archive indexing completed: ${levelsProcessed} new levels, ${levelsSkipped} skipped`
      );
      logger.info(`Total indexed: ${finalStats.uniqueProcessed} items`);

      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = `Archive indexing failed: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);

      // Save state even on error
      await this.stateManager.saveState();

      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } finally {
      this.cleanup();
    }
  }

  private async processCompleteItem(metadata: ArchiveMetadata): Promise<boolean> {
    try {
      // Step 1: Fetch detailed metadata
      const details = await this.metadataFetcher.fetchItemDetails(metadata.identifier);
      if (!details) {
        logger.warn(`No details available for ${metadata.identifier}`);
        return false;
      }

      // Step 2: Check if this item has any .dat files
      const datFiles = details.files.filter(
        file => file.name.toLowerCase().endsWith('.dat') || file.format === 'dat'
      );

      if (datFiles.length === 0) {
        logger.debug(`No .dat files found in ${metadata.identifier}`);
        return false;
      }

      // Step 3: Create level directory and metadata
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(
        this.outputDir,
        getSourceLevelsDir(MapSource.INTERNET_ARCHIVE),
        levelId
      );
      await FileUtils.ensureDir(levelDir);

      const levelMetadata: LevelMetadata = {
        id: levelId,
        title: metadata.title || 'Unknown',
        author: metadata.creator || 'Unknown',
        description: metadata.description,
        postedDate: metadata.date ? new Date(metadata.date) : new Date(),
        source: MapSource.INTERNET_ARCHIVE,
        sourceUrl: `https://archive.org/details/${metadata.identifier}`,
        originalId: metadata.identifier,
        downloadCount: metadata.downloads,
        fileSize: metadata.item_size,
        tags: this.extractTags(metadata, details),
        formatVersion: 'below-v1', // Archive.org levels are below v1
      };

      // Step 4: Download files immediately
      const levelFiles: LevelFile[] = [];
      const downloadPromises: Promise<void>[] = [];

      // Download .dat files
      for (const datFile of datFiles) {
        const localPath = path.join(levelDir, FileUtils.sanitizeFilename(datFile.name));
        const downloadUrl = `https://archive.org/download/${metadata.identifier}/${encodeURIComponent(datFile.name)}`;

        const downloadPromise = this.downloadFile(downloadUrl, localPath)
          .then(() => {
            levelFiles.push({
              filename: FileUtils.sanitizeFilename(datFile.name),
              path: localPath,
              size: parseInt(datFile.size || '0'),
              type: 'dat',
            });
          })
          .catch(error => {
            logger.error(`Failed to download ${datFile.name}: ${error}`);
            throw error;
          });

        downloadPromises.push(downloadPromise);
      }

      // Download images (screenshots and thumbnails)
      const images = this.categorizeImages(details.files);

      // Download best screenshot
      if (images.screenshots.length > 0) {
        const screenshot = images.screenshots[0];
        const ext = path.extname(screenshot.name).toLowerCase();
        const localPath = path.join(levelDir, `screenshot_original${ext}`);
        const downloadUrl = `https://archive.org/download/${metadata.identifier}/${encodeURIComponent(screenshot.name)}`;

        const downloadPromise = this.downloadFile(downloadUrl, localPath)
          .then(() => {
            levelFiles.push({
              filename: `screenshot_original${ext}`,
              path: localPath,
              size: parseInt(screenshot.size || '0'),
              type: 'other',
            });
            logger.debug(`Downloaded screenshot: ${screenshot.name}`);
          })
          .catch(error => {
            logger.warn(`Failed to download screenshot: ${error}`);
          });

        downloadPromises.push(downloadPromise);
      }

      // Download best thumbnail
      if (images.thumbnails.length > 0) {
        const thumbnail = images.thumbnails[0];
        const ext = path.extname(thumbnail.name).toLowerCase();
        const localPath = path.join(levelDir, `thumbnail_original${ext}`);
        const downloadUrl = `https://archive.org/download/${metadata.identifier}/${encodeURIComponent(thumbnail.name)}`;

        const downloadPromise = this.downloadFile(downloadUrl, localPath)
          .then(() => {
            levelFiles.push({
              filename: `thumbnail_original${ext}`,
              path: localPath,
              size: parseInt(thumbnail.size || '0'),
              type: 'other',
            });
            logger.debug(`Downloaded thumbnail: ${thumbnail.name}`);
          })
          .catch(error => {
            logger.warn(`Failed to download thumbnail: ${error}`);
          });

        downloadPromises.push(downloadPromise);
      }

      // Wait for all downloads to complete
      await Promise.all(downloadPromises);

      // Step 5: Save level data
      const level: Level = {
        metadata: levelMetadata,
        files: levelFiles,
        catalogPath: levelDir,
        datFilePath: levelFiles.find(f => f.type === 'dat')?.path || '',
        indexed: new Date(),
        lastUpdated: new Date(),
      };

      await this.saveLevelData(level);

      return true;
    } catch (error) {
      logger.error(`Failed to process item ${metadata.identifier}:`, error);
      throw error;
    }
  }

  private async downloadFile(url: string, localPath: string): Promise<void> {
    // Simple direct download with retry logic
    let lastError: Error | null = null;
    const retries = this.config.retryAttempts || 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.downloadTimeout || 60000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'ManicMinersIndexer/1.0',
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Download to file
        const buffer = await response.arrayBuffer();
        await FileUtils.ensureDir(path.dirname(localPath));
        await fs.writeFile(localPath, Buffer.from(buffer));

        // Verify file exists
        const stats = await fs.stat(localPath);
        if (stats.size === 0) {
          throw new Error('Downloaded file is empty');
        }

        return; // Success!
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          logger.warn(`Download attempt ${attempt} failed for ${url}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Download failed after all retries');
  }

  private extractTags(metadata: ArchiveMetadata, _details: ArchiveItemDetails): string[] {
    const tags = new Set<string>(['archive', 'internet-archive']);

    // Add mediatype as tag
    if (metadata.mediatype) {
      tags.add(metadata.mediatype);
    }

    // Add collection tags
    if (metadata.collection) {
      metadata.collection.forEach(col => tags.add(col));
    }

    // Extract tags from description
    const description = metadata.description || '';
    const tagMatches = description.match(/#\w+/g);
    if (tagMatches) {
      tagMatches.forEach(tag => tags.add(tag.substring(1).toLowerCase()));
    }

    return Array.from(tags);
  }

  private categorizeImages(files: ArchiveFile[]): {
    screenshots: ArchiveFile[];
    thumbnails: ArchiveFile[];
  } {
    const imageFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
    });

    const screenshots: ArchiveFile[] = [];
    const thumbnails: ArchiveFile[] = [];

    // Categorize and score images
    const scoredImages = imageFiles.map(file => {
      const name = file.name.toLowerCase();
      let score = 0;
      let isThumb = false;

      // Identify thumbnails
      if (name.includes('_thumb') || name === '__ia_thumb.jpg') {
        isThumb = true;
        // Prefer non-IA thumbnails
        if (name === '__ia_thumb.jpg') {
          score = 1; // Lowest priority thumbnail
        } else if (name.includes('_thumb.jpg')) {
          score = 10; // Medium priority - level-specific thumbnail
        }
      } else {
        // Screenshots/full images
        if (name.includes('screenshot')) {
          score = 100; // Highest priority
        } else if (name.endsWith('.png')) {
          score = 50; // PNG files are often the main level preview
        } else if (name.includes('screen') || name.includes('preview')) {
          score = 30;
        } else {
          score = 10; // Other images
        }

        // Prefer larger files for screenshots
        const size = parseInt(file.size || '0');
        if (size > 1000000) score += 10; // > 1MB
      }

      return { file, score, isThumb };
    });

    // Sort by score (highest first)
    scoredImages.sort((a, b) => b.score - a.score);

    // Separate into categories
    for (const item of scoredImages) {
      if (item.isThumb) {
        thumbnails.push(item.file);
      } else {
        screenshots.push(item.file);
      }
    }

    // If no thumbnails found but we have __ia_thumb.jpg, use it
    if (thumbnails.length === 0) {
      const iaThumb = files.find(f => f.name === '__ia_thumb.jpg');
      if (iaThumb) {
        thumbnails.push(iaThumb);
      }
    }

    return { screenshots, thumbnails };
  }

  // Keep the old method for backward compatibility
  private findScreenshots(files: ArchiveFile[]): ArchiveFile[] {
    const { screenshots } = this.categorizeImages(files);
    return screenshots;
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
  }

  async getStats() {
    const stateStats = this.stateManager.getStats();
    const downloadStats = this.downloadManager.getStats();

    return {
      state: stateStats,
      downloads: downloadStats,
      cache: {
        metadataCache: await this.getMetadataCacheSize(),
      },
    };
  }

  private async getMetadataCacheSize(): Promise<number> {
    try {
      const cacheDir = path.join(this.outputDir, '.cache', 'metadata');
      const files = await FileUtils.listFiles(cacheDir);
      return files.length;
    } catch {
      return 0;
    }
  }

  async clearCache(): Promise<void> {
    await this.metadataFetcher.clearCache();
    logger.info('Cache cleared');
  }

  async resetState(): Promise<void> {
    await this.stateManager.reset();
    logger.info('State reset');
  }

  abort(): void {
    this.abortController.abort();
    this.downloadManager.abort();
    logger.info('Archive indexing aborted');
  }

  private cleanup(): void {
    this.stateManager.cleanup();
  }
}
