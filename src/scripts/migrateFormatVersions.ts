import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { Level, MapSource } from '../types';
import { DatVersionDetector } from '../utils/datVersionDetector';
import { getAllSourceLevelsDirs } from '../utils/sourceUtils';

/**
 * Migration script to add formatVersion to all existing catalog files
 */
export class FormatVersionMigrator {
  private outputDir: string;
  private migratedCount = 0;
  private skippedCount = 0;
  private errorCount = 0;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  async migrate(): Promise<void> {
    logger.info('Starting format version migration...');

    try {
      // Process all source directories
      const sourceDirs = getAllSourceLevelsDirs();

      for (const sourceDir of sourceDirs) {
        const fullSourcePath = path.join(this.outputDir, sourceDir);

        // Skip if directory doesn't exist
        if (!(await fs.pathExists(fullSourcePath))) {
          logger.info(`Skipping ${sourceDir} - directory not found`);
          continue;
        }

        // Determine source from directory name
        const source = this.getSourceFromDir(sourceDir);
        if (!source) {
          logger.warn(`Unknown source for directory: ${sourceDir}`);
          continue;
        }

        logger.info(`Processing ${source} levels...`);
        await this.migrateSourceLevels(fullSourcePath, source);
      }

      logger.success(
        `Migration completed: ${this.migratedCount} migrated, ${this.skippedCount} skipped, ${this.errorCount} errors`
      );
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  private getSourceFromDir(sourceDir: string): MapSource | null {
    if (sourceDir.includes('internet-archive')) return MapSource.INTERNET_ARCHIVE;
    if (sourceDir.includes('archive')) return MapSource.INTERNET_ARCHIVE; // backward compatibility
    if (sourceDir.includes('hognose')) return MapSource.HOGNOSE;
    if (sourceDir.includes('discord-community')) return MapSource.DISCORD_COMMUNITY;
    if (sourceDir.includes('discord-archive')) return MapSource.DISCORD_ARCHIVE;
    if (sourceDir.includes('discord')) return MapSource.DISCORD_COMMUNITY; // backward compatibility
    return null;
  }

  private async migrateSourceLevels(sourceDir: string, source: MapSource): Promise<void> {
    const levelDirs = await FileUtils.listDirectories(sourceDir);

    for (const levelDir of levelDirs) {
      const catalogPath = path.join(sourceDir, levelDir, 'catalog.json');

      try {
        // Check if catalog exists
        if (!(await fs.pathExists(catalogPath))) {
          logger.warn(`No catalog found for ${levelDir}`);
          this.errorCount++;
          continue;
        }

        // Read existing catalog
        const catalog = await FileUtils.readJSON<Level>(catalogPath);
        if (!catalog) {
          logger.warn(`Failed to read catalog for ${levelDir}`);
          this.errorCount++;
          continue;
        }

        // Check if already has formatVersion
        if (catalog.metadata.formatVersion) {
          logger.debug(
            `Level ${catalog.metadata.title} already has formatVersion: ${catalog.metadata.formatVersion}`
          );
          this.skippedCount++;
          continue;
        }

        // Detect version based on source
        const formatVersion = DatVersionDetector.getVersionBySource(source);

        // Update catalog with format version
        catalog.metadata.formatVersion = formatVersion;

        // Write updated catalog
        await FileUtils.writeJSON(catalogPath, catalog);

        logger.item(`Updated ${catalog.metadata.title} with formatVersion: ${formatVersion}`);
        this.migratedCount++;
      } catch (error) {
        logger.error(`Failed to migrate ${levelDir}:`, error);
        this.errorCount++;
      }
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const outputDir = process.argv[2] || './output';

  const migrator = new FormatVersionMigrator(outputDir);
  migrator
    .migrate()
    .then(() => {
      logger.success('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}
