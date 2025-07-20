import fetch, {
  RequestInit as NodeFetchRequestInit,
  Response as NodeFetchResponse,
} from 'node-fetch';
import unzipper from 'unzipper';
import {
  HognoseRelease,
  Level,
  LevelMetadata,
  MapSource,
  IndexerProgress,
  IndexerResult,
} from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { getSourceLevelsDir } from '../utils/sourceUtils';
import path from 'path';
import fs from 'fs-extra';
import { Readable } from 'stream';
import crypto from 'crypto';
import { HognoseStateManager } from './hognose/HognoseStateManager';

// GitHub API types
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body?: string;
  published_at: string;
  assets: GitHubAsset[];
}

export class HognoseIndexer {
  private githubRepo: string;
  private outputDir: string;
  private processedReleases: Set<string> = new Set();
  private catalogManager: import('../catalog/catalogManager').CatalogManager | null = null;
  private retryAttempts: number;
  private downloadTimeout: number;
  private verifyChecksums: boolean;
  private skipExisting: boolean;
  private stateManager: HognoseStateManager;

  constructor(
    githubRepo: string,
    outputDir: string,
    retryAttempts?: number,
    downloadTimeout?: number,
    verifyChecksums?: boolean,
    skipExisting?: boolean
  ) {
    this.githubRepo = githubRepo;
    this.outputDir = outputDir;
    this.retryAttempts = retryAttempts ?? 3;
    this.downloadTimeout = downloadTimeout ?? 60000; // Default 60 seconds
    this.verifyChecksums = verifyChecksums ?? false;
    this.skipExisting = skipExisting ?? true; // Default to true
    this.stateManager = new HognoseStateManager(outputDir);
  }

  async indexHognose(
    progressCallback?: (progress: IndexerProgress) => void,
    options?: {
      latestOnly?: boolean;
      replaceExisting?: boolean; // Clear old Hognose levels before indexing new ones
    }
  ): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.section('Initializing Hognose indexer');

      // Initialize catalog manager
      const { CatalogManager } = await import('../catalog/catalogManager');
      this.catalogManager = new CatalogManager(this.outputDir);
      await this.catalogManager.loadCatalogIndex();

      // Load state if skipExisting is enabled
      if (this.skipExisting && !options?.replaceExisting) {
        await this.stateManager.loadState();
        logger.info(
          `Loaded state: ${this.stateManager.getProcessedReleaseCount()} releases already processed`
        );
      }

      // If replaceExisting is true, clear all existing Hognose levels
      if (options?.replaceExisting) {
        logger.item('Clearing existing Hognose levels...');
        const clearedCount = await this.catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
        if (clearedCount > 0) {
          logger.success(`Cleared ${clearedCount} existing Hognose levels`);
        }

        // Clear the processed releases tracking from memory
        this.processedReleases.clear();

        // Clear state if skipExisting is enabled
        if (this.skipExisting) {
          await this.stateManager.clearState();
        }
      }

      progressCallback?.({
        phase: 'scraping',
        source: MapSource.HOGNOSE,
        current: 0,
        total: 0,
        message: 'Fetching Hognose releases...',
      });

      // Load previously processed releases (if not replacing)
      if (!options?.replaceExisting) {
        await this.loadProcessedReleases();
      }

      const releases = await this.fetchHognoseReleases();

      // Check if we have a new release
      if (releases.length > 0 && this.processedReleases.size > 0) {
        const latestRelease = releases[0].tag_name;
        if (!this.processedReleases.has(latestRelease)) {
          logger.info(`New Hognose release detected: ${latestRelease}`);

          // If we have a new release and replaceExisting is not explicitly false, clear old levels
          if (options?.replaceExisting !== false) {
            logger.info('Clearing old Hognose levels for new release...');
            const clearedCount = await this.catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
            if (clearedCount > 0) {
              logger.info(`Cleared ${clearedCount} old Hognose levels`);
            }

            // Clear processed releases to reprocess the new one
            this.processedReleases.clear();
          }
        }
      }

      // By default, only process the latest release
      const releasesToProcess =
        options?.latestOnly !== false && releases.length > 0
          ? [releases[0]] // GitHub API returns releases in descending order (newest first)
          : releases;

      if (options?.latestOnly !== false && releases.length > 1) {
        logger.item(
          `Found ${releases.length} releases, processing only the latest: ${releases[0].tag_name}`
        );
      }

      progressCallback?.({
        phase: 'downloading',
        source: MapSource.HOGNOSE,
        current: 0,
        total: releasesToProcess.length,
        message: 'Processing Hognose releases...',
      });

      for (let i = 0; i < releasesToProcess.length; i++) {
        const release = releasesToProcess[i];

        try {
          // Check if release should be skipped
          if (this.skipExisting && this.stateManager.isReleaseProcessed(release.tag_name)) {
            logger.debug(`Skipping already processed release: ${release.tag_name}`);
            levelsSkipped++;
            continue;
          }

          // Legacy check for backward compatibility
          if (this.processedReleases.has(release.tag_name)) {
            logger.debug(`Skipping already processed release (legacy): ${release.tag_name}`);
            levelsSkipped++;
            continue;
          }

          const levels = await this.processHognoseRelease(release);
          let releaseLevelsProcessed = 0;
          for (const level of levels) {
            await this.saveLevelData(level);
            levelsProcessed++;
            releaseLevelsProcessed++;
            logger.item(`${level.metadata.title}`, '✔');
          }

          // Mark release as processed if we successfully processed any levels
          if (releaseLevelsProcessed > 0) {
            this.processedReleases.add(release.tag_name);
            await this.saveProcessedReleases();

            // Update state if skipExisting is enabled
            if (this.skipExisting) {
              this.stateManager.markReleaseProcessed(release.tag_name);
              await this.stateManager.saveState();
            }
          }
        } catch (error) {
          const errorMsg = `Failed to process Hognose release ${release.tag_name}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
          levelsSkipped++;
        }

        progressCallback?.({
          phase: 'downloading',
          source: MapSource.HOGNOSE,
          current: i + 1,
          total: releasesToProcess.length,
          message: `Processing release ${release.name}...`,
        });
      }

      logger.success(
        `Hognose indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`
      );

      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = `Hognose indexing failed: ${error}`;
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

  private async fetchWithRetry(
    url: string,
    options: NodeFetchRequestInit = {}
  ): Promise<NodeFetchResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.downloadTimeout);

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return response;
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
          logger.warn(
            `Request failed for ${url}, attempt ${attempt}/${this.retryAttempts}. Retrying in ${delay}ms... Error: ${lastError.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  private async fetchHognoseReleases(): Promise<HognoseRelease[]> {
    try {
      const apiUrl = `https://api.github.com/repos/${this.githubRepo}/releases`;
      logger.debug(`Fetching Hognose releases from: ${apiUrl}`);

      const response = await this.fetchWithRetry(apiUrl);
      const releases = (await response.json()) as GitHubRelease[];

      const hognoseReleases: HognoseRelease[] = releases.map(release => ({
        id: release.id,
        tag_name: release.tag_name,
        name: release.name,
        body: release.body || '',
        published_at: release.published_at,
        assets: release.assets.map((asset: GitHubAsset) => ({
          name: asset.name,
          download_url: asset.browser_download_url,
          size: asset.size,
        })),
      }));

      logger.info(`Found ${hognoseReleases.length} Hognose releases`);
      return hognoseReleases;
    } catch (error) {
      logger.error('Failed to fetch Hognose releases:', error);
      throw error;
    }
  }

  private async processHognoseRelease(release: HognoseRelease): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      // Look for ZIP files in the release assets
      const zipAssets = release.assets.filter(asset => asset.name.toLowerCase().endsWith('.zip'));

      if (zipAssets.length === 0) {
        logger.debug(`No ZIP files found in release: ${release.tag_name}`);
        return levels;
      }

      for (const zipAsset of zipAssets) {
        try {
          // Process ZIP file directly from URL stream
          const extractedLevels = await this.extractAndProcessZipFromUrl(
            zipAsset.download_url,
            release
          );
          levels.push(...extractedLevels);
        } catch (error) {
          logger.error(`Failed to process ZIP asset ${zipAsset.name}:`, error);
        }
      }

      return levels;
    } catch (error) {
      logger.error(`Failed to process Hognose release ${release.tag_name}:`, error);
      return levels;
    }
  }

  private async extractAndProcessZipFromUrl(
    url: string,
    release: HognoseRelease
  ): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      // Fetch the ZIP file as a stream
      const response = await this.fetchWithRetry(url);

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // If checksum verification is enabled, we need to buffer the response to calculate hash
      let responseStream: NodeJS.ReadableStream;

      if (this.verifyChecksums) {
        // Buffer the entire response to calculate checksum
        const buffer = await response.buffer();

        // Calculate SHA-256 checksum
        const hash = crypto.createHash('sha256');
        hash.update(buffer);
        const calculatedChecksum = hash.digest('hex');

        logger.info(`ZIP file SHA-256 checksum for ${url}: ${calculatedChecksum}`);

        // Create a readable stream from the buffer
        responseStream = Readable.from(buffer);
      } else {
        // Use the response stream directly
        responseStream = response.body as unknown as NodeJS.ReadableStream;
      }

      // Process ZIP entries from the stream
      const zipStream = responseStream.pipe(unzipper.Parse());

      await new Promise<void>((resolve, reject) => {
        zipStream.on('entry', async (entry: unzipper.Entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'

          if (type === 'File' && fileName.toLowerCase().endsWith('.dat')) {
            try {
              // Process .dat file directly from the ZIP stream
              const level = await this.createLevelFromStream(fileName, entry, release);
              if (level) {
                levels.push(level);
              }
            } catch (error) {
              logger.error(`Failed to process ${fileName} from ZIP:`, error);
              entry.autodrain();
            }
          } else {
            // Skip non-.dat files
            entry.autodrain();
          }
        });

        zipStream.on('finish', resolve);
        zipStream.on('error', reject);
      });

      return levels;
    } catch (error) {
      logger.error(`Failed to extract ZIP from URL ${url}:`, error);
      return levels;
    }
  }

  private async createLevelFromStream(
    fileName: string,
    entry: unzipper.Entry,
    release: HognoseRelease
  ): Promise<Level | null> {
    try {
      // First, stream to a temporary location to calculate hash if skipExisting is enabled
      const tempPath = path.join(
        this.outputDir,
        '.temp',
        `${Date.now()}_${path.basename(fileName)}`
      );
      await FileUtils.ensureDir(path.dirname(tempPath));

      // Stream the .dat file to temp location
      const writeStream = fs.createWriteStream(tempPath);
      await new Promise<void>((resolve, reject) => {
        entry.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        entry.on('error', reject);
      });

      // Calculate hash
      const fileHash = await FileUtils.getFileHash(tempPath);

      // Check if file has already been processed
      if (this.skipExisting && this.stateManager.isFileProcessed(fileHash)) {
        logger.debug(`Skipping already processed file: ${fileName} (hash: ${fileHash})`);
        await fs.remove(tempPath);
        return null;
      }

      // Generate level ID and create final directory
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.HOGNOSE), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = path.basename(fileName);
      const localDatPath = path.join(levelDir, datFileName);

      // Move from temp to final location
      await fs.move(tempPath, localDatPath, { overwrite: true });

      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');

      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: 'Hognose',
        description: release.body || `Level from Hognose release ${release.tag_name}`,
        postedDate: new Date(release.published_at),
        source: MapSource.HOGNOSE,
        sourceUrl: `https://github.com/${this.githubRepo}/releases/tag/${release.tag_name}`,
        originalId: `${release.tag_name}/${datFileName}`,
        tags: ['hognose', 'github-release', release.tag_name],
        formatVersion: 'v1', // Hognose levels are v1 or above
      };

      const levelFiles = [
        {
          filename: datFileName,
          path: localDatPath,
          size: await FileUtils.getFileSize(localDatPath),
          hash: fileHash,
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

      // Mark file as processed if skipExisting is enabled
      if (this.skipExisting) {
        this.stateManager.markFileProcessed(fileHash, levelId);
      }

      return level;
    } catch (error) {
      logger.error(`Failed to create level from stream ${fileName}:`, error);
      return null;
    }
  }

  private async loadProcessedReleases(): Promise<void> {
    // Instead of loading from a file, query the catalog for existing Hognose levels
    // and extract the release tags from their metadata
    if (!this.catalogManager) {
      const { CatalogManager } = await import('../catalog/catalogManager');
      this.catalogManager = new CatalogManager(this.outputDir);
      await this.catalogManager.loadCatalogIndex();
    }

    const catalog = this.catalogManager.getCatalog();
    const processedTags = new Set<string>();

    for (const level of catalog.levels) {
      if (level.metadata.source === MapSource.HOGNOSE && level.metadata.tags) {
        // Extract release tag from tags array
        const releaseTag = level.metadata.tags.find(
          (tag: string) =>
            tag.startsWith('v') ||
            tag.match(/^\d+\.\d+/) ||
            (tag !== 'hognose' && tag !== 'github-release')
        );
        if (releaseTag) {
          processedTags.add(releaseTag);
        }
      }
    }

    this.processedReleases = processedTags;
    logger.debug(`Loaded ${processedTags.size} processed releases from catalog`);
  }

  private async saveProcessedReleases(): Promise<void> {
    // No need to save to a separate file anymore
    // The processed releases are tracked through the catalog itself
    logger.debug('Processed releases tracked in catalog metadata');
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }
}
