import { MasterIndexer } from '../../src/catalog/masterIndexer';
import { IndexerConfig } from '../../src/types';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';

async function testAllIndexers() {
  const config: IndexerConfig = {
    outputDir: './test-output/integration/all-indexers',
    tempDir: './test-output/temp/all-indexers',
    generateThumbnails: true,
    generateScreenshots: true,
    sources: {
      archive: {
        enabled: true,
        baseUrl: 'https://archive.org/advancedsearch.php',
      },
      discord: {
        enabled: true,
        channels: ['https://discord.com/channels/580269696369164299/1139908458968252457'],
      },
      hognose: {
        enabled: true,
        githubRepo: 'charredUtensil/hognose',
      },
    },
    rendering: {
      thumbnailSize: { width: 200, height: 200 },
      screenshotSize: { width: 800, height: 600 },
      biomeColors: {
        rock: '#8B4513',
        dirt: '#8B4513',
        lava: '#FF4500',
        water: '#4169E1',
        ice: '#87CEEB',
        energy: '#FFD700',
        ore: '#C0C0C0',
        crystal: '#9400D3',
        rubble: '#A0522D',
        path: '#DCDCDC',
        slug: '#228B22',
        erosion: '#FF6347',
        landslide: '#8B4513',
        foundation: '#696969',
        hard: '#2F4F4F',
        solid: '#000000',
        power: '#FFFF00',
        lake: '#1E90FF',
        undiscovered: '#404040',
      },
    },
  };

  // Clean up previous test output
  await fs.remove(config.outputDir);
  await fs.remove(config.tempDir);
  await fs.ensureDir(config.outputDir);
  await fs.ensureDir(config.tempDir);

  logger.info('Starting test of all indexers...');
  logger.info('Output directory:', config.outputDir);
  logger.info('\nEnabled sources:');
  logger.info('- Archive.org:', config.sources.archive.enabled);
  logger.info('- Discord:', config.sources.discord.enabled);
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
