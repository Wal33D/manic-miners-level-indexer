import { MasterIndexer } from '../../src/catalog/masterIndexer';
import { IndexerConfig } from '../../src/types';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import { TestPaths } from '../../src/tests/test-config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testAllIndexers() {
  const config: IndexerConfig = {
    outputDir: TestPaths.integration.all,
    sources: {
      internet_archive: {
        enabled: true,
        baseUrl: 'https://archive.org/advancedsearch.php',
      },
      discord_community: {
        enabled: true,
        channels: ['https://discord.com/channels/580269696369164299/1139908458968252457'],
      },
      discord_archive: {
        enabled: false,
        channels: [],
      },
      hognose: {
        enabled: true,
        githubRepo: 'charredUtensil/hognose',
      },
    },
  };

  // Clean up previous test output
  await fs.remove(config.outputDir);
  await fs.ensureDir(config.outputDir);

  logger.info('Starting test of all indexers...');
  logger.info('Output directory:', config.outputDir);
  logger.info('\nEnabled sources:');
  logger.info('- Archive.org:', config.sources.internet_archive.enabled);
  logger.info('- Discord Community:', config.sources.discord_community.enabled);
  logger.info('- Discord Archive:', config.sources.discord_archive.enabled);
  logger.info('- Hognose:', config.sources.hognose.enabled);

  const masterIndexer = new MasterIndexer(config);

  const startTime = Date.now();

  try {
    await masterIndexer.indexAll();

    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(1);

    logger.info('\n=== Test Results ===');
    logger.info(`Total time: ${minutes}m ${seconds}s`);

    // Get catalog stats
    const stats = await masterIndexer.getCatalogStats();
    logger.info(`\nCatalog Statistics:`);
    logger.info(`Total levels: ${stats.totalLevels}`);
    logger.info(`By source:`);
    Object.entries(stats.sources).forEach(([source, count]) => {
      logger.info(`  - ${source}: ${count}`);
    });

    // Check master index
    const masterIndexPath = `${config.outputDir}/master_index.json`;
    if (await fs.pathExists(masterIndexPath)) {
      const masterIndex = await fs.readJSON(masterIndexPath);
      logger.info('\nMaster index generated successfully');
      logger.info(`Top authors: ${masterIndex.statistics.topAuthors.length}`);
      logger.info(`Recent levels: ${masterIndex.statistics.recentLevels.length}`);
    }

    // Export catalog
    const exportPath = await masterIndexer.exportCatalog('json');
    logger.info(`\nCatalog exported to: ${exportPath}`);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAllIndexers().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
