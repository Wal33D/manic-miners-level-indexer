import { HognoseIndexer } from '../../src/indexers/hognoseIndexer';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testHognoseIndexer() {
  const outputDir = './test-output/integration/hognose';
  const githubRepo = 'charredUtensil/hognose';

  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  logger.info('Starting Hognose indexer test...');
  logger.info('Output directory:', outputDir);
  logger.info('GitHub repository:', githubRepo);

  const indexer = new HognoseIndexer(githubRepo, outputDir);

  const startTime = Date.now();

  const result = await indexer.indexHognose(progress => {
    logger.info(`[${progress.phase}] ${progress.message} - ${progress.current}/${progress.total}`);
  });

  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = ((duration % 60000) / 1000).toFixed(1);

  logger.info('\n=== Test Results ===');
  logger.info(`Success: ${result.success}`);
  logger.info(`Total time: ${minutes}m ${seconds}s`);
  logger.info(`Levels processed: ${result.levelsProcessed}`);
  logger.info(`Levels skipped: ${result.levelsSkipped}`);
  logger.info(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    logger.warn('\nErrors:');
    result.errors.forEach(err => logger.warn(`- ${err}`));
  }

  // Check what was downloaded
  const levelsDir = path.join(outputDir, 'levels');
  if (await fs.pathExists(levelsDir)) {
    const allEntries = await fs.readdir(levelsDir);
    // Filter out non-directories like .DS_Store
    const levelDirs: string[] = [];
    for (const entry of allEntries) {
      const entryPath = path.join(levelsDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        levelDirs.push(entry);
      }
    }
    logger.info(`\nCreated ${levelDirs.length} level directories`);

    // Sample check of first few levels
    const sampleSize = Math.min(10, levelDirs.length);
    logger.info(`\nSample of first ${sampleSize} levels:`);

    for (let i = 0; i < sampleSize; i++) {
      const levelDir = path.join(levelsDir, levelDirs[i]);
      const files = await fs.readdir(levelDir);
      const catalogPath = path.join(levelDir, 'catalog.json');

      if (await fs.pathExists(catalogPath)) {
        const catalog = await fs.readJSON(catalogPath);
        logger.info(`- ${catalog.metadata.title}: ${files.length} files`);
      }
    }
  }

  // Check releases info
  const releasesPath = path.join(outputDir, 'hognose_releases.json');
  if (await fs.pathExists(releasesPath)) {
    const releases = await fs.readJSON(releasesPath);
    logger.info(`\nIndexed ${releases.length} Hognose releases`);
    if (releases.length > 0) {
      logger.info(`Latest release: ${releases[0].tag_name} - ${releases[0].name}`);
    }
  }

  // Rebuild catalog index to make levels accessible via CatalogManager
  logger.info('\nRebuilding catalog index...');
  const { CatalogManager } = await import('../../src/catalog/catalogManager');
  const catalogManager = new CatalogManager(outputDir);
  await catalogManager.rebuildCatalogIndex();

  const allLevels = await catalogManager.getAllLevels();
  logger.info(`Total levels in catalog: ${allLevels.length}`);
}

// Run the test
testHognoseIndexer().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
