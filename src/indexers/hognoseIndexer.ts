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
import { Readable } from 'stream';

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
      logger.section('Initializing Hognose indexer');

      // If replaceExisting is true, clear all existing Hognose levels
      if (options?.replaceExisting) {
        logger.item('Clearing existing Hognose levels...');
        const { CatalogManager } = await import('../catalog/catalogManager');
        const catalogManager = new CatalogManager(this.outputDir);
        await catalogManager.loadCatalogIndex();

        const clearedCount = await catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
        if (clearedCount > 0) {
          logger.success(`Cleared ${clearedCount} existing Hognose levels`);
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
          if (this.processedReleases.has(release.tag_name)) {
            logger.debug(`Skipping already processed release: ${release.tag_name}`);
            levelsSkipped++;
            continue;
          }

          const levels = await this.processHognoseRelease(release);
          for (const level of levels) {
            await this.saveLevelData(level);
            levelsProcessed++;
            logger.item(`${level.metadata.title}`, '✔');
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
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process ZIP entries directly from the stream
      const zipStream = Readable.from(response.body).pipe(unzipper.Parse());

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
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, getSourceLevelsDir(MapSource.HOGNOSE), levelId);
      await FileUtils.ensureDir(levelDir);

      const datFileName = path.basename(fileName);
      const localDatPath = path.join(levelDir, datFileName);

      // Stream the .dat file directly to disk
      const writeStream = fs.createWriteStream(localDatPath);
      await new Promise<void>((resolve, reject) => {
        entry.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        entry.on('error', reject);
      });

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
      logger.error(`Failed to create level from stream ${fileName}:`, error);
      return null;
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
