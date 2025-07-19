import dotenv from 'dotenv';
import { CatalogManager } from '../../src/catalog/catalogManager';
import { MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import { FileUtils } from '../../src/utils/fileUtils';
import { getSourceLevelsDir } from '../../src/utils/sourceUtils';
import { CATALOG_FILENAMES } from '../../src/config/default';
import path from 'path';

dotenv.config();

const OUTPUT_DIR = path.join(process.cwd(), 'output');

async function rebuildCatalog() {
  try {
    logger.info('Starting catalog rebuild process...');

    // Initialize the catalog manager
    logger.info('Initializing catalog manager...');
    const catalogManager = new CatalogManager(OUTPUT_DIR);

    // Rebuild the catalog from all level directories
    logger.info('Rebuilding catalog index from all sources...');
    await catalogManager.rebuildCatalogIndex();

    // Get statistics
    logger.info('\nAnalyzing catalog...');
    const stats = catalogManager.getCatalogStats();

    logger.info(`\n=== Catalog Summary ===`);
    logger.info(`Total levels: ${stats.totalLevels}`);
    logger.info(`  - Internet Archive: ${stats.sources[MapSource.INTERNET_ARCHIVE] || 0}`);
    logger.info(`  - Discord Community: ${stats.sources[MapSource.DISCORD_COMMUNITY] || 0}`);
    logger.info(`  - Discord Archive: ${stats.sources[MapSource.DISCORD_ARCHIVE] || 0}`);
    logger.info(`  - Hognose: ${stats.sources[MapSource.HOGNOSE] || 0}`);

    // Get Discord-specific stats
    const discordCommunityLevels = await catalogManager.getLevelsBySource(
      MapSource.DISCORD_COMMUNITY
    );
    const discordArchiveLevels = await catalogManager.getLevelsBySource(MapSource.DISCORD_ARCHIVE);
    const allDiscordLevels = [...discordCommunityLevels, ...discordArchiveLevels];

    // Analyze Discord levels
    logger.info('\n=== Discord Level Analysis ===');
    logger.info(`Discord levels by source:`);
    logger.info(`  - Discord Community: ${discordCommunityLevels.length} levels`);
    logger.info(`  - Discord Archive: ${discordArchiveLevels.length} levels`);
    logger.info(`  - Total Discord: ${allDiscordLevels.length} levels`);

    // Generate master index
    logger.info('\nGenerating master index file...');
    const masterIndexPath = path.join(OUTPUT_DIR, CATALOG_FILENAMES.MASTER);
    const masterIndex = {
      generated: new Date().toISOString(),
      totalLevels: stats.totalLevels,
      sources: stats.sources,
      lastUpdated: stats.lastUpdated,
      discordStats: {
        total: allDiscordLevels.length,
        community: discordCommunityLevels.length,
        archive: discordArchiveLevels.length,
      },
      structure: {
        catalogIndex: CATALOG_FILENAMES.INDEX,
        sourceDirs: {
          internet_archive: getSourceLevelsDir(MapSource.INTERNET_ARCHIVE),
          discord_community: getSourceLevelsDir(MapSource.DISCORD_COMMUNITY),
          discord_archive: getSourceLevelsDir(MapSource.DISCORD_ARCHIVE),
          hognose: getSourceLevelsDir(MapSource.HOGNOSE),
        },
      },
    };

    await FileUtils.writeJSON(masterIndexPath, masterIndex);
    logger.success(`Master index generated at: ${masterIndexPath}`);

    // Validate the catalog
    logger.info('\nValidating catalog integrity...');
    const validation = await catalogManager.validateCatalog();

    if (validation.valid) {
      logger.success('Catalog validation passed!');
    } else {
      logger.warn(`Catalog validation found ${validation.errors.length} issues`);
    }

    // Export catalogs
    logger.info('\nExporting catalogs...');
    const jsonExport = await catalogManager.exportCatalog('json');
    const csvExport = await catalogManager.exportCatalog('csv');

    logger.success(`Catalog exported to:`);
    logger.success(`  - JSON: ${jsonExport}`);
    logger.success(`  - CSV: ${csvExport}`);

    // Sample some Discord levels
    logger.info('\n=== Sample Discord Levels ===');
    const recentDiscordLevels = allDiscordLevels
      .sort((a, b) => b.metadata.postedDate.getTime() - a.metadata.postedDate.getTime())
      .slice(0, 5);

    recentDiscordLevels.forEach(level => {
      logger.info(
        `- ${level.metadata.title} by ${level.metadata.author} (${new Date(level.metadata.postedDate).toLocaleDateString()})`
      );
    });

    logger.success('\n=== Catalog Rebuild Complete! ===');
    logger.info('\nCatalog files:');
    logger.info(`  - ${path.join(OUTPUT_DIR, CATALOG_FILENAMES.INDEX)} - Main catalog index`);
    logger.info(
      `  - ${path.join(OUTPUT_DIR, getSourceLevelsDir(MapSource.DISCORD_COMMUNITY), CATALOG_FILENAMES.INDEX)} - Discord Community index`
    );
    logger.info(
      `  - ${path.join(OUTPUT_DIR, getSourceLevelsDir(MapSource.DISCORD_ARCHIVE), CATALOG_FILENAMES.INDEX)} - Discord Archive index`
    );
    logger.info(`  - ${masterIndexPath} - Master index with statistics`);
  } catch (error) {
    logger.error('Failed to rebuild catalog:', error);
    process.exit(1);
  }
}

// Run the catalog rebuild
rebuildCatalog().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
