import { Level, MapSource, IndexerResult } from '../types';
import { CatalogManager } from './catalogManager';
import { InternetArchiveIndexer } from '../indexers/archive/InternetArchiveIndexer';
import { HognoseIndexer } from '../indexers/hognoseIndexer';
import { DiscordUnifiedIndexer } from '../indexers/discordUnified';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { getAllSourceLevelsDirs } from '../utils/sourceUtils';
import { IndexerConfig } from '../types';
import path from 'path';
import fs from 'fs-extra';

export class MasterIndexer {
  private config: IndexerConfig;
  private catalogManager: CatalogManager;
  private internetArchiveIndexer?: InternetArchiveIndexer;
  private hognoseIndexer?: HognoseIndexer;
  private discordCommunityIndexer?: DiscordUnifiedIndexer;
  private discordArchiveIndexer?: DiscordUnifiedIndexer;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.catalogManager = new CatalogManager(config.outputDir);

    // Initialize indexers based on config
    if (config.sources.internet_archive.enabled) {
      this.internetArchiveIndexer = new InternetArchiveIndexer(
        config.sources.internet_archive,
        config.outputDir
      );
    }

    if (config.sources.hognose.enabled && config.sources.hognose.githubRepo) {
      this.hognoseIndexer = new HognoseIndexer(
        config.sources.hognose.githubRepo,
        config.outputDir,
        config.sources.hognose.retryAttempts,
        config.sources.hognose.downloadTimeout,
        config.sources.hognose.verifyChecksums,
        config.sources.hognose.skipExisting
      );
    }

    if (config.sources.discord_community.enabled) {
      this.discordCommunityIndexer = new DiscordUnifiedIndexer(
        config.sources.discord_community.channels,
        config.outputDir,
        MapSource.DISCORD_COMMUNITY,
        config.sources.discord_community.excludedThreads,
        config.sources.discord_community.retryAttempts,
        config.sources.discord_community.downloadTimeout,
        config.sources.discord_community.skipExisting
      );
    }

    if (config.sources.discord_archive.enabled) {
      this.discordArchiveIndexer = new DiscordUnifiedIndexer(
        config.sources.discord_archive.channels,
        config.outputDir,
        MapSource.DISCORD_ARCHIVE,
        config.sources.discord_archive.excludedThreads,
        config.sources.discord_archive.retryAttempts,
        config.sources.discord_archive.downloadTimeout,
        config.sources.discord_archive.skipExisting
      );
    }
  }

  async indexAll(): Promise<void> {
    try {
      logger.info('Starting master indexing process...');

      // Ensure output directories exist
      await this.setupDirectories();

      // Load existing catalog
      await this.catalogManager.loadCatalogIndex();

      let totalProcessed = 0;
      let totalErrors = 0;

      // Discord indexers will handle their own authentication
      // Just ensure they use the same cache directory
      let discordEnabled = false;
      if (this.discordCommunityIndexer || this.discordArchiveIndexer) {
        discordEnabled = true;
        logger.info('Discord indexers will authenticate as needed...');
      }

      // NOW create array of indexing promises AFTER Discord auth
      const indexingPromises: Promise<{ source: string; result: IndexerResult }>[] = [];

      // Add Internet Archive indexer
      if (this.internetArchiveIndexer) {
        logger.info('Starting improved Internet Archive indexing (V2)...');
        indexingPromises.push(
          this.internetArchiveIndexer
            .indexArchive(progress => {
              logger.progress(
                `[Internet Archive] ${progress.message}`,
                progress.current,
                progress.total
              );
            })
            .then(result => ({ source: 'Internet Archive', result }))
        );
      }

      // Add Hognose indexer
      if (this.hognoseIndexer) {
        logger.info('Starting Hognose indexing...');
        indexingPromises.push(
          this.hognoseIndexer
            .indexHognose(progress => {
              logger.progress(`[Hognose] ${progress.message}`, progress.current, progress.total);
            })
            .then(result => ({ source: 'Hognose', result }))
        );
      }

      // Add Discord indexer promises - they handle their own auth
      if (discordEnabled) {
        if (this.discordCommunityIndexer) {
          logger.info('Starting Discord Community indexing...');
          indexingPromises.push(
            this.discordCommunityIndexer
              .indexDiscord(progress => {
                logger.progress(
                  `[Discord Community] ${progress.message}`,
                  progress.current,
                  progress.total
                );
              })
              .then(result => ({ source: 'Discord Community', result }))
          );
        }

        if (this.discordArchiveIndexer) {
          logger.info('Starting Discord Archive indexing...');
          indexingPromises.push(
            this.discordArchiveIndexer
              .indexDiscord(progress => {
                logger.progress(
                  `[Discord Archive] ${progress.message}`,
                  progress.current,
                  progress.total
                );
              })
              .then(result => ({ source: 'Discord Archive', result }))
          );
        }
      }

      // Run all indexers simultaneously
      logger.info(`Running ${indexingPromises.length} indexers simultaneously...`);
      const results = await Promise.allSettled(indexingPromises);

      // Process results
      for (const promiseResult of results) {
        if (promiseResult.status === 'fulfilled') {
          const { source, result } = promiseResult.value;
          if (result.success) {
            logger.success(
              `${source} indexing completed: ${result.levelsProcessed} levels processed`
            );
            totalProcessed += result.levelsProcessed;
          } else {
            logger.error(`${source} indexing failed with ${result.errors.length} errors`);
            totalErrors += result.errors.length;
          }
        } else {
          logger.error('Indexer promise rejected:', promiseResult.reason);
          totalErrors++;
        }
      }

      // Rebuild catalog index from all level directories
      await this.catalogManager.rebuildCatalogIndex();

      // Generate final master index
      await this.generateMasterIndex();

      // Validate catalog
      const validation = await this.catalogManager.validateCatalog();
      if (!validation.valid) {
        logger.warn(`Catalog validation found ${validation.errors.length} issues`);
        for (const error of validation.errors) {
          logger.error(error);
        }
      }

      logger.success(
        `Master indexing completed: ${totalProcessed} levels processed, ${totalErrors} errors`
      );
    } catch (error) {
      logger.error('Master indexing failed:', error);
      throw error;
    }
  }

  async indexSource(source: MapSource): Promise<void> {
    try {
      logger.info(`Indexing from source: ${source}`);

      await this.setupDirectories();
      await this.catalogManager.loadCatalogIndex();

      switch (source) {
        case MapSource.INTERNET_ARCHIVE:
          if (this.internetArchiveIndexer) {
            await this.internetArchiveIndexer.indexArchive(progress => {
              logger.progress(progress.message, progress.current, progress.total);
            });
          }
          break;

        case MapSource.HOGNOSE:
          if (this.hognoseIndexer) {
            await this.hognoseIndexer.indexHognose(progress => {
              logger.progress(progress.message, progress.current, progress.total);
            });
          }
          break;

        case MapSource.DISCORD_COMMUNITY:
          if (this.discordCommunityIndexer) {
            await this.discordCommunityIndexer.indexDiscord(progress => {
              logger.progress(progress.message, progress.current, progress.total);
            });
          }
          break;

        case MapSource.DISCORD_ARCHIVE:
          if (this.discordArchiveIndexer) {
            await this.discordArchiveIndexer.indexDiscord(progress => {
              logger.progress(progress.message, progress.current, progress.total);
            });
          }
          break;
      }

      await this.catalogManager.rebuildCatalogIndex();
      await this.generateMasterIndex();

      logger.success(`Source indexing completed for: ${source}`);
    } catch (error) {
      logger.error(`Source indexing failed for ${source}:`, error);
      throw error;
    }
  }

  async generateMasterIndex(): Promise<void> {
    try {
      logger.info('Generating master index...');

      const stats = this.catalogManager.getCatalogStats();

      const masterIndex = {
        metadata: {
          generatedAt: new Date().toISOString(),
          totalLevels: stats.totalLevels,
          sources: stats.sources,
          lastUpdated: stats.lastUpdated,
        },
        statistics: {
          topAuthors: await this.getTopAuthors(),
          recentLevels: await this.catalogManager.getRecentLevels(20),
          sourceSummary: await this.getSourceSummary(),
        },
      };

      const masterIndexPath = path.join(this.config.outputDir, 'master_index.json');
      await FileUtils.writeJSON(masterIndexPath, masterIndex);

      logger.success(`Master index generated: ${masterIndexPath}`);
    } catch (error) {
      logger.error('Failed to generate master index:', error);
      throw error;
    }
  }

  private async setupDirectories(): Promise<void> {
    await FileUtils.ensureDir(this.config.outputDir);

    // Create all source-specific level directories
    const sourceDirs = getAllSourceLevelsDirs();
    for (const sourceDir of sourceDirs) {
      await FileUtils.ensureDir(path.join(this.config.outputDir, sourceDir));
    }
  }

  private async getTopAuthors(): Promise<{ author: string; count: number }[]> {
    const authorCounts: Record<string, number> = {};
    const allLevels = await this.getAllLevels();

    for (const level of allLevels) {
      const author = level.metadata.author;
      authorCounts[author] = (authorCounts[author] || 0) + 1;
    }

    return Object.entries(authorCounts)
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  private async getSourceSummary(): Promise<
    Partial<Record<MapSource, { count: number; lastUpdated: string }>>
  > {
    const allLevels = await this.getAllLevels();
    const summary: Partial<Record<MapSource, { count: number; lastUpdated: string }>> = {
      [MapSource.INTERNET_ARCHIVE]: { count: 0, lastUpdated: '' },
      [MapSource.DISCORD_COMMUNITY]: { count: 0, lastUpdated: '' },
      [MapSource.DISCORD_ARCHIVE]: { count: 0, lastUpdated: '' },
      [MapSource.HOGNOSE]: { count: 0, lastUpdated: '' },
    };

    for (const level of allLevels) {
      const source = level.metadata.source;
      if (summary[source]) {
        summary[source].count++;

        const levelDate = level.metadata.postedDate.toISOString();
        if (!summary[source].lastUpdated || levelDate > summary[source].lastUpdated) {
          summary[source].lastUpdated = levelDate;
        }
      }
    }

    return summary;
  }

  private async getAllLevels(): Promise<Level[]> {
    const levels: Level[] = [];
    const sourceDirs = getAllSourceLevelsDirs();

    for (const sourceDir of sourceDirs) {
      const levelsDir = path.join(this.config.outputDir, sourceDir);

      // Skip if directory doesn't exist
      if (!(await fs.pathExists(levelsDir))) {
        continue;
      }

      const levelDirectories = await FileUtils.listDirectories(levelsDir);

      for (const levelDir of levelDirectories) {
        const catalogPath = path.join(levelsDir, levelDir, 'catalog.json');
        const level = await FileUtils.readJSON<Level>(catalogPath);
        if (level) {
          // Parse dates from strings
          const parsedLevel = {
            ...level,
            metadata: {
              ...level.metadata,
              postedDate: new Date(level.metadata.postedDate),
            },
            indexed: new Date(level.indexed),
            lastUpdated: new Date(level.lastUpdated),
          };
          levels.push(parsedLevel);
        }
      }
    }

    return levels;
  }

  async getCatalogStats(): Promise<{
    totalLevels: number;
    sources: Partial<Record<MapSource, number>>;
    lastUpdated: Date;
  }> {
    await this.catalogManager.loadCatalogIndex();
    return this.catalogManager.getCatalogStats();
  }

  async exportCatalog(format: 'json' | 'csv' = 'json'): Promise<string> {
    await this.catalogManager.loadCatalogIndex();
    return this.catalogManager.exportCatalog(format);
  }
}
