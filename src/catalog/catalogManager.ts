import { Level, CatalogIndex, MapSource } from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { getAllSourceLevelsDirs, getSourceLevelsDir } from '../utils/sourceUtils';
import { CATALOG_FILENAMES } from '../config/default';
import path from 'path';
import fs from 'fs-extra';

export class CatalogManager {
  private outputDir: string;
  private catalogIndex: CatalogIndex;
  private sourceCatalogs: Map<MapSource, CatalogIndex>;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.catalogIndex = {
      totalLevels: 0,
      sources: {
        [MapSource.INTERNET_ARCHIVE]: 0,
        [MapSource.DISCORD_COMMUNITY]: 0,
        [MapSource.DISCORD_ARCHIVE]: 0,
        [MapSource.HOGNOSE]: 0,
      },
      lastUpdated: new Date(),
      levels: [],
    };
    this.sourceCatalogs = new Map();
    // Initialize source catalogs
    for (const source of Object.values(MapSource)) {
      this.sourceCatalogs.set(source, {
        totalLevels: 0,
        sources: {
          [MapSource.INTERNET_ARCHIVE]: 0,
          [MapSource.DISCORD_COMMUNITY]: 0,
          [MapSource.DISCORD_ARCHIVE]: 0,
          [MapSource.HOGNOSE]: 0,
        },
        lastUpdated: new Date(),
        levels: [],
      });
    }
  }

  async loadCatalogIndex(): Promise<void> {
    try {
      // Load main catalog index
      const indexPath = path.join(this.outputDir, CATALOG_FILENAMES.INDEX);
      const existingIndex = await FileUtils.readJSON<CatalogIndex>(indexPath);

      if (existingIndex) {
        // Parse dates from strings
        this.catalogIndex = {
          ...existingIndex,
          lastUpdated: new Date(existingIndex.lastUpdated),
          levels: existingIndex.levels.map(level => ({
            ...level,
            metadata: {
              ...level.metadata,
              postedDate: new Date(level.metadata.postedDate),
            },
            indexed: new Date(level.indexed),
            lastUpdated: new Date(level.lastUpdated),
          })),
        };
        logger.info(`Loaded catalog index with ${this.catalogIndex.totalLevels} levels`);
      } else {
        logger.info('No existing catalog index found, creating new one');
      }

      // Load source-specific catalogs
      for (const source of Object.values(MapSource)) {
        const sourceDir = getSourceLevelsDir(source);
        const sourceIndexPath = path.join(this.outputDir, sourceDir, CATALOG_FILENAMES.INDEX);
        const sourceIndex = await FileUtils.readJSON<CatalogIndex>(sourceIndexPath);

        if (sourceIndex) {
          this.sourceCatalogs.set(source, {
            ...sourceIndex,
            lastUpdated: new Date(sourceIndex.lastUpdated),
            levels: sourceIndex.levels.map(level => ({
              ...level,
              metadata: {
                ...level.metadata,
                postedDate: new Date(level.metadata.postedDate),
              },
              indexed: new Date(level.indexed),
              lastUpdated: new Date(level.lastUpdated),
            })),
          });
          logger.debug(`Loaded ${source} catalog with ${sourceIndex.totalLevels} levels`);
        }
      }
    } catch (error) {
      logger.error('Failed to load catalog index:', error);
    }
  }

  async saveCatalogIndex(): Promise<void> {
    try {
      // Save main catalog index
      const indexPath = path.join(this.outputDir, CATALOG_FILENAMES.INDEX);
      await FileUtils.ensureDir(this.outputDir);
      await FileUtils.writeJSON(indexPath, this.catalogIndex);
      logger.debug(`Saved catalog index to ${indexPath}`);

      // Save source-specific catalog indexes
      for (const [source, catalog] of this.sourceCatalogs.entries()) {
        const sourceDir = getSourceLevelsDir(source);
        const sourcePath = path.join(this.outputDir, sourceDir);
        await FileUtils.ensureDir(sourcePath);
        const sourceIndexPath = path.join(sourcePath, CATALOG_FILENAMES.INDEX);
        await FileUtils.writeJSON(sourceIndexPath, catalog);
        logger.debug(`Saved ${source} catalog index to ${sourceIndexPath}`);
      }
    } catch (error) {
      logger.error('Failed to save catalog index:', error);
      throw error;
    }
  }

  async addLevel(level: Level): Promise<void> {
    try {
      // Update main catalog
      const existingIndex = this.catalogIndex.levels.findIndex(
        l => l.metadata.id === level.metadata.id
      );

      if (existingIndex !== -1) {
        // Update existing level
        this.catalogIndex.levels[existingIndex] = level;
        logger.debug(`Updated existing level: ${level.metadata.title}`);
      } else {
        // Add new level
        this.catalogIndex.levels.push(level);
        // Initialize source count if it doesn't exist
        if (!this.catalogIndex.sources[level.metadata.source]) {
          this.catalogIndex.sources[level.metadata.source] = 0;
        }
        this.catalogIndex.sources[level.metadata.source]++;
        this.catalogIndex.totalLevels++;
        logger.debug(`Added new level: ${level.metadata.title}`);
      }

      // Update source-specific catalog
      const sourceCatalog = this.sourceCatalogs.get(level.metadata.source);
      if (sourceCatalog) {
        const sourceExistingIndex = sourceCatalog.levels.findIndex(
          l => l.metadata.id === level.metadata.id
        );

        if (sourceExistingIndex !== -1) {
          sourceCatalog.levels[sourceExistingIndex] = level;
        } else {
          sourceCatalog.levels.push(level);
          // Initialize source count if it doesn't exist
          if (!sourceCatalog.sources[level.metadata.source]) {
            sourceCatalog.sources[level.metadata.source] = 0;
          }
          sourceCatalog.sources[level.metadata.source]++;
          sourceCatalog.totalLevels++;
        }
        sourceCatalog.lastUpdated = new Date();
      }

      this.catalogIndex.lastUpdated = new Date();
      await this.saveCatalogIndex();
    } catch (error) {
      logger.error(`Failed to add level ${level.metadata.title} to catalog:`, error);
      throw error;
    }
  }

  async removeLevel(levelId: string): Promise<boolean> {
    try {
      const levelIndex = this.catalogIndex.levels.findIndex(l => l.metadata.id === levelId);

      if (levelIndex === -1) {
        logger.warn(`Level ${levelId} not found in catalog`);
        return false;
      }

      const level = this.catalogIndex.levels[levelIndex];

      // Remove level from main index
      this.catalogIndex.levels.splice(levelIndex, 1);
      this.catalogIndex.sources[level.metadata.source]--;
      this.catalogIndex.totalLevels--;

      // Remove level from source catalog
      const sourceCatalog = this.sourceCatalogs.get(level.metadata.source);
      if (sourceCatalog) {
        const sourceIndex = sourceCatalog.levels.findIndex(l => l.metadata.id === levelId);
        if (sourceIndex !== -1) {
          sourceCatalog.levels.splice(sourceIndex, 1);
          sourceCatalog.sources[level.metadata.source]--;
          sourceCatalog.totalLevels--;
          sourceCatalog.lastUpdated = new Date();
        }
      }

      // Remove level directory
      await FileUtils.deleteFile(level.catalogPath);

      this.catalogIndex.lastUpdated = new Date();
      await this.saveCatalogIndex();

      logger.info(`Removed level: ${level.metadata.title}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove level ${levelId}:`, error);
      return false;
    }
  }

  async getRecentLevels(limit = 10): Promise<Level[]> {
    return this.catalogIndex.levels
      .sort((a, b) => {
        const dateA = new Date(a.metadata.postedDate);
        const dateB = new Date(b.metadata.postedDate);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit);
  }

  async getAllLevels(): Promise<Level[]> {
    return [...this.catalogIndex.levels];
  }

  async getLevelsBySource(source: MapSource): Promise<Level[]> {
    return this.catalogIndex.levels.filter(level => level.metadata.source === source);
  }

  async clearLevelsBySource(source: MapSource): Promise<number> {
    try {
      const levelsToRemove = this.catalogIndex.levels.filter(
        level => level.metadata.source === source
      );

      let removedCount = 0;

      for (const level of levelsToRemove) {
        try {
          // Remove level directory
          await FileUtils.deleteFile(level.catalogPath);

          // Remove from main index
          const index = this.catalogIndex.levels.findIndex(
            l => l.metadata.id === level.metadata.id
          );
          if (index !== -1) {
            this.catalogIndex.levels.splice(index, 1);
            this.catalogIndex.sources[source]--;
            this.catalogIndex.totalLevels--;
            removedCount++;
          }
        } catch (error) {
          logger.error(`Failed to remove level ${level.metadata.id}:`, error);
        }
      }

      // Clear source catalog
      const sourceCatalog = this.sourceCatalogs.get(source);
      if (sourceCatalog) {
        sourceCatalog.levels = [];
        sourceCatalog.totalLevels = 0;
        sourceCatalog.sources[source] = 0;
        sourceCatalog.lastUpdated = new Date();
      }

      this.catalogIndex.lastUpdated = new Date();
      await this.saveCatalogIndex();

      logger.info(`Cleared ${removedCount} ${source} levels from catalog`);
      return removedCount;
    } catch (error) {
      logger.error(`Failed to clear ${source} levels:`, error);
      return 0;
    }
  }

  async rebuildCatalogIndex(): Promise<void> {
    try {
      logger.info('Rebuilding catalog index from level directories...');

      // Reset indexes
      this.catalogIndex = {
        totalLevels: 0,
        sources: {},
        lastUpdated: new Date(),
        levels: [],
      };

      // Reset source catalogs
      for (const source of Object.values(MapSource)) {
        this.sourceCatalogs.set(source, {
          totalLevels: 0,
          sources: {
            [MapSource.INTERNET_ARCHIVE]: 0,
            [MapSource.DISCORD_COMMUNITY]: 0,
            [MapSource.DISCORD_ARCHIVE]: 0,
            [MapSource.HOGNOSE]: 0,
          },
          lastUpdated: new Date(),
          levels: [],
        });
      }

      // Scan all source level directories
      const sourceDirs = getAllSourceLevelsDirs();

      for (const sourceDir of sourceDirs) {
        const levelsDir = path.join(this.outputDir, sourceDir);

        // Skip if directory doesn't exist
        if (!(await fs.pathExists(levelsDir))) {
          continue;
        }

        const levelDirectories = await FileUtils.listDirectories(levelsDir);

        for (const levelDir of levelDirectories) {
          const catalogPath = path.join(levelsDir, levelDir, CATALOG_FILENAMES.LEVEL);
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

            // Add to main catalog
            this.catalogIndex.levels.push(parsedLevel);
            // Initialize source count if it doesn't exist
            if (!this.catalogIndex.sources[level.metadata.source]) {
              this.catalogIndex.sources[level.metadata.source] = 0;
            }
            this.catalogIndex.sources[level.metadata.source]++;
            this.catalogIndex.totalLevels++;

            // Add to source catalog
            const sourceCatalog = this.sourceCatalogs.get(level.metadata.source);
            if (sourceCatalog) {
              sourceCatalog.levels.push(parsedLevel);
              // Initialize source count if it doesn't exist
              if (!sourceCatalog.sources[level.metadata.source]) {
                sourceCatalog.sources[level.metadata.source] = 0;
              }
              sourceCatalog.sources[level.metadata.source]++;
              sourceCatalog.totalLevels++;
            }
          }
        }
      }

      await this.saveCatalogIndex();
      logger.success(`Rebuilt catalog index with ${this.catalogIndex.totalLevels} levels`);
    } catch (error) {
      logger.error('Failed to rebuild catalog index:', error);
      throw error;
    }
  }

  async validateCatalog(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      logger.info('Validating catalog...');

      for (const level of this.catalogIndex.levels) {
        // Check if level directory exists
        if (!(await fs.pathExists(level.catalogPath))) {
          errors.push(`Level directory missing: ${level.catalogPath}`);
          continue;
        }

        // Check if dat file exists
        if (!(await fs.pathExists(level.datFilePath))) {
          errors.push(`DAT file missing for level ${level.metadata.title}: ${level.datFilePath}`);
        }

        // Check if catalog file exists
        const catalogPath = path.join(level.catalogPath, CATALOG_FILENAMES.LEVEL);
        if (!(await fs.pathExists(catalogPath))) {
          errors.push(`Catalog file missing for level ${level.metadata.title}: ${catalogPath}`);
        }

        // Validate file references
        for (const file of level.files) {
          if (!(await fs.pathExists(file.path))) {
            errors.push(`File missing for level ${level.metadata.title}: ${file.path}`);
          }
        }
      }

      if (errors.length === 0) {
        logger.success('Catalog validation passed');
        return { valid: true, errors: [] };
      } else {
        logger.warn(`Catalog validation found ${errors.length} errors`);
        return { valid: false, errors };
      }
    } catch (error) {
      const errorMsg = `Catalog validation failed: ${error}`;
      logger.error(errorMsg);
      return { valid: false, errors: [errorMsg] };
    }
  }

  async exportCatalog(format: 'json' | 'csv' = 'json'): Promise<string> {
    const outputPath = path.join(this.outputDir, `catalog_export.${format}`);

    try {
      if (format === 'json') {
        await FileUtils.writeJSON(outputPath, this.catalogIndex);
      } else if (format === 'csv') {
        const csvContent = this.generateCSV();
        await fs.writeFile(outputPath, csvContent);
      }

      logger.success(`Exported catalog to ${outputPath}`);
      return outputPath;
    } catch (error) {
      logger.error(`Failed to export catalog:`, error);
      throw error;
    }
  }

  private generateCSV(): string {
    const headers = [
      'ID',
      'Title',
      'Author',
      'Source',
      'Posted Date',
      'File Size',
      'Tags',
      'Description',
      'DAT File',
    ];

    const rows = this.catalogIndex.levels.map(level => {
      // Convert absolute paths to relative paths
      const datFileRelative = path.relative(this.outputDir, level.datFilePath);

      return [
        level.metadata.id,
        level.metadata.title,
        level.metadata.author,
        level.metadata.source,
        level.metadata.postedDate.toISOString(),
        level.metadata.fileSize || 0,
        level.metadata.tags?.join(';') || '',
        level.metadata.description || '',
        datFileRelative,
      ];
    });

    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  getCatalogStats(): {
    totalLevels: number;
    sources: Partial<Record<MapSource, number>>;
    lastUpdated: Date;
  } {
    return {
      totalLevels: this.catalogIndex.totalLevels,
      sources: { ...this.catalogIndex.sources },
      lastUpdated: this.catalogIndex.lastUpdated,
    };
  }

  getCatalog(): CatalogIndex {
    return this.catalogIndex;
  }
}
