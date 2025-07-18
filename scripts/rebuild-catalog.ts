import dotenv from 'dotenv';
import { CatalogManager } from '../src/catalog/catalogManager';
import { MapSource } from '../src/types';
import { logger } from '../src/utils/logger';
import { FileUtils } from '../src/utils/fileUtils';
import { getSourceLevelsDir } from '../src/utils/sourceUtils';
import { CATALOG_FILENAMES } from '../src/config/default';
import path from 'path';

dotenv.config();

const OUTPUT_DIR = path.join(process.cwd(), 'data');

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
    logger.info(`  - Archive: ${stats.sources[MapSource.ARCHIVE]}`);
    logger.info(`  - Discord: ${stats.sources[MapSource.DISCORD]}`);
    logger.info(`  - Hognose: ${stats.sources[MapSource.HOGNOSE]}`);

    // Get Discord-specific stats
    const discordLevels = await catalogManager.getLevelsBySource(MapSource.DISCORD);

    // Analyze Discord levels by channel
    logger.info('\n=== Discord Level Analysis ===');
    const channelStats = new Map<string, number>();
    const oldChannelId = '683985075704299520';
    const forumChannelId = '1139908458968252457';
    let oldChannelCount = 0;
    let forumChannelCount = 0;

    for (const level of discordLevels) {
      // The sourceUrl format is https://discord.com/channels/{messageId}
      // We need to check the original message ID to determine the channel
      const messageId = level.metadata.originalId;

      // For old channel messages, IDs are typically lower
      // This is a heuristic based on Discord's snowflake ID system
      if (messageId && BigInt(messageId) < BigInt('1000000000000000000')) {
        oldChannelCount++;
      } else {
        forumChannelCount++;
      }
    }

    logger.info(`Discord levels by channel (estimated):`);
    logger.info(`  - Old pre-v1 maps: ~${oldChannelCount} levels`);
    logger.info(`  - Community forum: ~${forumChannelCount} levels`);

    // Generate master index
    logger.info('\nGenerating master index file...');
    const masterIndexPath = path.join(OUTPUT_DIR, CATALOG_FILENAMES.MASTER);
    const masterIndex = {
      generated: new Date().toISOString(),
      totalLevels: stats.totalLevels,
      sources: stats.sources,
      lastUpdated: stats.lastUpdated,
      discordStats: {
        total: stats.sources[MapSource.DISCORD],
        oldChannel: oldChannelCount,
        forumChannel: forumChannelCount,
      },
      structure: {
        catalogIndex: CATALOG_FILENAMES.INDEX,
        sourceDirs: {
          archive: getSourceLevelsDir(MapSource.ARCHIVE),
          discord: getSourceLevelsDir(MapSource.DISCORD),
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

    // Check for duplicates
    logger.info('\nChecking for duplicate levels...');
    const duplicates = await catalogManager.getDuplicateLevels();

    if (duplicates.length > 0) {
      logger.warn(`Found ${duplicates.length} sets of duplicate levels:`);
      duplicates.slice(0, 5).forEach(set => {
        logger.warn(`  - "${set[0].metadata.title}" appears ${set.length} times`);
      });
    } else {
      logger.success('No duplicate levels found!');
    }

    // Sample some Discord levels
    logger.info('\n=== Sample Discord Levels ===');
    const recentDiscordLevels = discordLevels
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
      `  - ${path.join(OUTPUT_DIR, getSourceLevelsDir(MapSource.DISCORD), CATALOG_FILENAMES.INDEX)} - Discord-specific index`
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
