import dotenv from 'dotenv';
import { DiscordDirectAPI } from '../../src/indexers/discordDirectAPI';
import { CatalogManager } from '../../src/catalog/catalogManager';
import { MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import { FileUtils } from '../../src/utils/fileUtils';
import { getSourceLevelsDir } from '../../src/utils/sourceUtils';
import { CATALOG_FILENAMES } from '../../src/config/default';
import path from 'path';
import fs from 'fs-extra';

dotenv.config();

const OUTPUT_DIR = path.join(process.cwd(), 'data');

// Discord channels to index
const DISCORD_CHANNELS = [
  '683985075704299520', // Old pre-v1 maps channel
  '1139908458968252457', // The community-levels forum channel (v1+)
];

async function buildDiscordCatalog() {
  try {
    logger.info('Starting Discord catalog build process...');

    // Step 1: Initialize the Discord indexer
    logger.info('Step 1: Initializing Discord Direct API indexer...');
    const discordIndexer = new DiscordDirectAPI(DISCORD_CHANNELS, OUTPUT_DIR);

    // Step 2: Run the indexer to fetch all Discord levels
    logger.info('Step 2: Fetching all Discord levels from both channels...');
    const indexResult = await discordIndexer.indexDiscord(progress => {
      logger.info(`${progress.phase}: ${progress.message} (${progress.current}/${progress.total})`);
    });

    if (!indexResult.success) {
      logger.error('Discord indexing failed:', indexResult.errors);
      return;
    }

    logger.success(`Discord indexing complete: ${indexResult.levelsProcessed} levels processed`);

    // Step 3: Initialize the catalog manager
    logger.info('\nStep 3: Initializing catalog manager...');
    const catalogManager = new CatalogManager(OUTPUT_DIR);

    // Step 4: Rebuild the catalog from all level directories
    logger.info('Step 4: Rebuilding catalog index from all sources...');
    await catalogManager.rebuildCatalogIndex();

    // Step 5: Get statistics for Discord levels
    logger.info('\nStep 5: Analyzing Discord catalog...');
    const stats = catalogManager.getCatalogStats();
    const discordLevels = await catalogManager.getLevelsBySource(MapSource.DISCORD);

    logger.info(`\n=== Discord Catalog Summary ===`);
    logger.info(`Total Discord levels: ${stats.sources[MapSource.DISCORD]}`);
    logger.info(`Total levels across all sources: ${stats.totalLevels}`);
    logger.info(`  - Archive: ${stats.sources[MapSource.ARCHIVE]}`);
    logger.info(`  - Discord: ${stats.sources[MapSource.DISCORD]}`);
    logger.info(`  - Hognose: ${stats.sources[MapSource.HOGNOSE]}`);

    // Step 6: Generate master index
    logger.info('\nStep 6: Generating master index file...');
    const masterIndexPath = path.join(OUTPUT_DIR, CATALOG_FILENAMES.MASTER);
    const masterIndex = {
      generated: new Date().toISOString(),
      totalLevels: stats.totalLevels,
      sources: stats.sources,
      lastUpdated: stats.lastUpdated,
      discordChannels: DISCORD_CHANNELS,
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

    // Step 7: Validate the catalog
    logger.info('\nStep 7: Validating catalog integrity...');
    const validation = await catalogManager.validateCatalog();

    if (validation.valid) {
      logger.success('Catalog validation passed!');
    } else {
      logger.warn(`Catalog validation found ${validation.errors.length} issues:`);
      validation.errors.slice(0, 10).forEach(error => logger.warn(`  - ${error}`));
      if (validation.errors.length > 10) {
        logger.warn(`  ... and ${validation.errors.length - 10} more`);
      }
    }

    // Step 8: Export catalog to different formats
    logger.info('\nStep 8: Exporting catalogs...');
    const jsonExport = await catalogManager.exportCatalog('json');
    const csvExport = await catalogManager.exportCatalog('csv');

    logger.success(`Catalog exported to:`);
    logger.success(`  - JSON: ${jsonExport}`);
    logger.success(`  - CSV: ${csvExport}`);

    // Step 9: Analyze Discord levels by channel
    logger.info('\nStep 9: Analyzing Discord levels by channel...');
    const channelStats = new Map<string, number>();

    for (const level of discordLevels) {
      // Extract channel ID from sourceUrl if available
      const urlMatch = level.metadata.sourceUrl?.match(/channels\/(\d+)/);
      if (urlMatch) {
        const channelId = urlMatch[1];
        channelStats.set(channelId, (channelStats.get(channelId) || 0) + 1);
      }
    }

    logger.info('\nDiscord levels by channel:');
    logger.info(
      `  - Old pre-v1 maps (683985075704299520): ${channelStats.get('683985075704299520') || 0} levels`
    );
    logger.info(
      `  - Community levels (1139908458968252457): ${channelStats.get('1139908458968252457') || 0} levels`
    );

    // Step 10: Check for duplicates
    logger.info('\nStep 10: Checking for duplicate levels...');
    const duplicates = await catalogManager.getDuplicateLevels();

    if (duplicates.length > 0) {
      logger.warn(`Found ${duplicates.length} sets of duplicate levels:`);
      duplicates.slice(0, 5).forEach(set => {
        logger.warn(`  - "${set[0].metadata.title}" appears ${set.length} times`);
      });
    } else {
      logger.success('No duplicate levels found!');
    }

    logger.success('\n=== Discord Catalog Build Complete! ===');
    logger.info('\nCatalog files created:');
    logger.info(`  - ${path.join(OUTPUT_DIR, CATALOG_FILENAMES.INDEX)} - Main catalog index`);
    logger.info(
      `  - ${path.join(OUTPUT_DIR, getSourceLevelsDir(MapSource.DISCORD), CATALOG_FILENAMES.INDEX)} - Discord-specific index`
    );
    logger.info(`  - ${masterIndexPath} - Master index with statistics`);
    logger.info(`  - ${jsonExport} - Full catalog export`);
    logger.info(`  - ${csvExport} - CSV catalog export`);
  } catch (error) {
    logger.error('Failed to build Discord catalog:', error);
    process.exit(1);
  }
}

// Run the catalog builder
buildDiscordCatalog().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
