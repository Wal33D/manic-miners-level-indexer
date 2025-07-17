import { Level, MapSource } from '../types';
import { CatalogManager } from './catalogManager';
import { MapRenderer } from '../renderer/mapRenderer';
import { ImprovedArchiveIndexerV2 } from '../indexers/archive/ImprovedArchiveIndexerV2';
import { HognoseIndexer } from '../indexers/hognoseIndexer';
import { DiscordIndexer } from '../indexers/discordIndexer';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { IndexerConfig } from '../types';
import path from 'path';

export class MasterIndexer {
  private config: IndexerConfig;
  private catalogManager: CatalogManager;
  private renderer: MapRenderer;
  private improvedArchiveIndexerV2?: ImprovedArchiveIndexerV2;
  private hognoseIndexer?: HognoseIndexer;
  private discordIndexer?: DiscordIndexer;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.catalogManager = new CatalogManager(config.outputDir);
    this.renderer = new MapRenderer(config.rendering);

    // Initialize indexers based on config
    if (config.sources.archive.enabled) {
      // Always use V2 for better streaming performance
      this.improvedArchiveIndexerV2 = new ImprovedArchiveIndexerV2(
        config.sources.archive,
        config.outputDir
      );
    }

    if (config.sources.hognose.enabled && config.sources.hognose.githubRepo) {
      this.hognoseIndexer = new HognoseIndexer(config.sources.hognose.githubRepo, config.outputDir);
    }

    if (config.sources.discord.enabled) {
      this.discordIndexer = new DiscordIndexer(
        config.sources.discord.channels,
        999, // Unlimited - index all messages
        config.outputDir
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

      // Index from all enabled sources
      if (this.improvedArchiveIndexerV2) {
        logger.info('Starting improved Internet Archive indexing (V2)...');
        const result = await this.improvedArchiveIndexerV2.indexArchive(progress => {
          logger.progress(progress.message, progress.current, progress.total);
        });

        if (result.success) {
          logger.success(`Archive indexing completed: ${result.levelsProcessed} levels processed`);
          totalProcessed += result.levelsProcessed;
        } else {
          logger.error(`Archive indexing failed with ${result.errors.length} errors`);
          totalErrors += result.errors.length;
        }
      }

      if (this.hognoseIndexer) {
        logger.info('Starting Hognose indexing...');
        const result = await this.hognoseIndexer.indexHognose(progress => {
          logger.progress(progress.message, progress.current, progress.total);
        });

        if (result.success) {
          logger.success(`Hognose indexing completed: ${result.levelsProcessed} levels processed`);
          totalProcessed += result.levelsProcessed;
        } else {
          logger.error(`Hognose indexing failed with ${result.errors.length} errors`);
          totalErrors += result.errors.length;
        }
      }

      if (this.discordIndexer) {
        logger.info('Starting Discord indexing...');
        const result = await this.discordIndexer.indexDiscord(progress => {
          logger.progress(progress.message, progress.current, progress.total);
        });

        if (result.success) {
          logger.success(`Discord indexing completed: ${result.levelsProcessed} levels processed`);
          totalProcessed += result.levelsProcessed;
        } else {
          logger.error(`Discord indexing failed with ${result.errors.length} errors`);
          totalErrors += result.errors.length;
        }
      }

      // Rebuild catalog index from all level directories
      await this.catalogManager.rebuildCatalogIndex();

      // Render all levels if configured
      if (this.config.generateScreenshots || this.config.generateThumbnails) {
        await this.renderAllLevels();
      }

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
        case MapSource.ARCHIVE:
          if (this.improvedArchiveIndexerV2) {
            await this.improvedArchiveIndexerV2.indexArchive(progress => {
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

        case MapSource.DISCORD:
          if (this.discordIndexer) {
            await this.discordIndexer.indexDiscord(progress => {
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

  async renderAllLevels(): Promise<void> {
    try {
      logger.info('Rendering all levels...');

      await this.renderer.renderAllLevels(this.config.outputDir, (current, total, levelName) => {
        logger.progress(`Rendering ${levelName}`, current, total);
      });

      logger.success('All levels rendered successfully');
    } catch (error) {
      logger.error('Failed to render all levels:', error);
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
    await FileUtils.ensureDir(path.join(this.config.outputDir, 'levels'));
    await FileUtils.ensureDir(this.config.tempDir);
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
    Record<MapSource, { count: number; lastUpdated: string }>
  > {
    const allLevels = await this.getAllLevels();
    const summary: Record<MapSource, { count: number; lastUpdated: string }> = {
      [MapSource.ARCHIVE]: { count: 0, lastUpdated: '' },
      [MapSource.DISCORD]: { count: 0, lastUpdated: '' },
      [MapSource.HOGNOSE]: { count: 0, lastUpdated: '' },
    };

    for (const level of allLevels) {
      const source = level.metadata.source;
      summary[source].count++;

      const levelDate = level.metadata.postedDate.toISOString();
      if (!summary[source].lastUpdated || levelDate > summary[source].lastUpdated) {
        summary[source].lastUpdated = levelDate;
      }
    }

    return summary;
  }

  private async getAllLevels(): Promise<Level[]> {
    const levelsDir = path.join(this.config.outputDir, 'levels');
    const levelDirectories = await FileUtils.listDirectories(levelsDir);
    const levels: Level[] = [];

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

    return levels;
  }

  async getCatalogStats(): Promise<{
    totalLevels: number;
    sources: Record<MapSource, number>;
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
