import fetch from 'node-fetch';
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

  constructor(githubRepo: string, outputDir: string) {
    this.githubRepo = githubRepo;
    this.outputDir = outputDir;
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
      logger.info('Starting Hognose indexing...');

      // If replaceExisting is true, clear all existing Hognose levels
      if (options?.replaceExisting) {
        logger.info('Clearing existing Hognose levels...');
        const { CatalogManager } = await import('../catalog/catalogManager');
        const catalogManager = new CatalogManager(this.outputDir);
        await catalogManager.loadCatalogIndex();

        const clearedCount = await catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
        if (clearedCount > 0) {
          logger.info(`Cleared ${clearedCount} existing Hognose levels`);
        }

        // Also clear the processed releases tracking
        this.processedReleases.clear();
        await this.saveProcessedReleases();
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
            const { CatalogManager } = await import('../catalog/catalogManager');
            const catalogManager = new CatalogManager(this.outputDir);
            await catalogManager.loadCatalogIndex();

            const clearedCount = await catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
            if (clearedCount > 0) {
              logger.info(`Cleared ${clearedCount} old Hognose levels`);
            }

            // Clear processed releases to reprocess the new one
            this.processedReleases.clear();
            await this.saveProcessedReleases();
          }
        }
      }

      // By default, only process the latest release
      const releasesToProcess =
        options?.latestOnly !== false && releases.length > 0
          ? [releases[0]] // GitHub API returns releases in descending order (newest first)
          : releases;

      if (options?.latestOnly !== false && releases.length > 1) {
        logger.info(
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
          if (this.processedReleases.has(release.tag_name)) {
            logger.debug(`Skipping already processed release: ${release.tag_name}`);
            levelsSkipped++;
            continue;
          }

          const levels = await this.processHognoseRelease(release);
          for (const level of levels) {
            await this.saveLevelData(level);
            levelsProcessed++;
            logger.info(`Processed Hognose level: ${level.metadata.title}`);
          }

          this.processedReleases.add(release.tag_name);
          await this.saveProcessedReleases();
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

  private async fetchHognoseReleases(): Promise<HognoseRelease[]> {
    try {
      const apiUrl = `https://api.github.com/repos/${this.githubRepo}/releases`;
      logger.debug(`Fetching Hognose releases from: ${apiUrl}`);

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

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
        const tempDir = await FileUtils.createTempDir();

        try {
          // Download the ZIP file
          const zipPath = path.join(tempDir, zipAsset.name);
          await this.downloadFile(zipAsset.download_url, zipPath);

          // Extract and process .dat files
          const extractedLevels = await this.extractAndProcessZip(zipPath, release);
          levels.push(...extractedLevels);
        } finally {
          await FileUtils.cleanupTempDir(tempDir);
        }
      }

      return levels;
    } catch (error) {
      logger.error(`Failed to process Hognose release ${release.tag_name}:`, error);
      return levels;
    }
  }

  private async extractAndProcessZip(zipPath: string, release: HognoseRelease): Promise<Level[]> {
    const levels: Level[] = [];

    try {
      const tempExtractDir = await FileUtils.createTempDir();

      // Extract ZIP file
      await fs
        .createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tempExtractDir }))
        .promise();

      // Find all .dat files in the extracted directory
      const datFiles = await this.findDatFiles(tempExtractDir);

      for (const datFile of datFiles) {
        const level = await this.createLevelFromDatFile(datFile, release);
        if (level) {
          levels.push(level);
        }
      }

      await FileUtils.cleanupTempDir(tempExtractDir);
      return levels;
    } catch (error) {
      logger.error(`Failed to extract ZIP file ${zipPath}:`, error);
      return levels;
    }
  }

  private async findDatFiles(dir: string): Promise<string[]> {
    const datFiles: string[] = [];

    const items = await fs.readdir(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        const subDatFiles = await this.findDatFiles(itemPath);
        datFiles.push(...subDatFiles);
      } else if (item.toLowerCase().endsWith('.dat')) {
        datFiles.push(itemPath);
      }
    }

    return datFiles;
  }

  private async createLevelFromDatFile(
    datFilePath: string,
    release: HognoseRelease
  ): Promise<Level | null> {
    try {
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.HOGNOSE), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = path.basename(datFilePath);
      const localDatPath = path.join(levelDir, datFileName);

      // Copy .dat file to level directory
      await FileUtils.copyFile(datFilePath, localDatPath);

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
      logger.error(`Failed to create level from .dat file ${datFilePath}:`, error);
      return null;
    }
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (response.body) {
      const fileStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        if (!response.body) {
          reject(new Error('Response body is null'));
          return;
        }
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', error => {
          fileStream.close();
          reject(error);
        });
      });
    }
  }

  private async loadProcessedReleases(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'hognose_processed.json');
    const processed = await FileUtils.readJSON<string[]>(processedPath);
    if (processed) {
      this.processedReleases = new Set(processed);
    }
  }

  private async saveProcessedReleases(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'hognose_processed.json');
    await FileUtils.writeJSON(processedPath, Array.from(this.processedReleases));
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }
}
