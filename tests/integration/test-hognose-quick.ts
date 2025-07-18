import { HognoseIndexer } from '../../src/indexers/hognoseIndexer';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';
import { TestPaths } from '../../src/tests/test-config';
import { getSourceLevelsDir } from '../../src/utils/sourceUtils';
import { MapSource } from '../../src/types';
import { OutputValidator } from '../../src/tests/outputValidator';

async function testHognoseQuick() {
  const outputDir = path.join(TestPaths.integration.hognose, 'quick');
  const githubRepo = 'charredUtensil/hognose';

  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  logger.info('Starting Hognose quick test (20 levels)...');
  logger.info('Output directory:', outputDir);
  logger.info('GitHub repository:', githubRepo);

  const indexer = new HognoseIndexer(githubRepo, outputDir);

  // Limit to 20 levels for quick testing
  const MAX_LEVELS = 20;
  let levelsProcessed = 0;

  // Monkey patch to limit levels
  const originalProcessLevel = (indexer as any).processLevel;
  (indexer as any).processLevel = async function (...args: any[]) {
    if (levelsProcessed >= MAX_LEVELS) {
      logger.info(`Skipping level (reached limit of ${MAX_LEVELS})`);
      return;
    }
    const result = await originalProcessLevel.apply(this, args);
    if (result) {
      levelsProcessed++;
    }
    return result;
  };

  const startTime = Date.now();

  const result = await indexer.indexHognose(progress => {
    logger.info(`[${progress.phase}] ${progress.message} - ${progress.current}/${progress.total}`);
  });

  const duration = Date.now() - startTime;
  const seconds = (duration / 1000).toFixed(1);

  logger.info('\n=== Quick Test Results ===');
  logger.info(`Success: ${result.success}`);
  logger.info(`Total time: ${seconds}s`);
  logger.info(`Levels processed: ${result.levelsProcessed}`);
  logger.info(`Levels skipped: ${result.levelsSkipped}`);
  logger.info(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    logger.warn('\nErrors:');
    result.errors.forEach(err => logger.warn(`- ${err}`));
  }

  // Check what was downloaded
  const levelsDir = path.join(outputDir, getSourceLevelsDir(MapSource.HOGNOSE));
  if (await fs.pathExists(levelsDir)) {
    const levelDirs = (await fs.readdir(levelsDir)).filter(async entry => {
      const entryPath = path.join(levelsDir, entry);
      const stat = await fs.stat(entryPath);
      return stat.isDirectory();
    });

    logger.info(`\nCreated ${levelDirs.length} level directories`);

    // Analyze each level
    for (const levelDir of levelDirs) {
      const levelPath = path.join(levelsDir, levelDir);
      const catalogPath = path.join(levelPath, 'catalog.json');

      if (await fs.pathExists(catalogPath)) {
        const catalog = await fs.readJSON(catalogPath);
        logger.info(`\n- ${catalog.metadata.title}`);
        logger.info(`  Release: ${catalog.metadata.releaseId}`);
        logger.info(`  Format: ${catalog.metadata.formatVersion}`);

        const files = await fs.readdir(levelPath);
        const datFile = files.find(f => f.endsWith('.dat'));
        if (datFile) {
          const stats = await fs.stat(path.join(levelPath, datFile));
          logger.info(`  DAT file: ${datFile} (${(stats.size / 1024).toFixed(1)} KB)`);
        }
      }
    }
  }

  // Quick validation
  logger.info('\n=== Quick Validation ===');
  const validator = new OutputValidator();
  const { summary } = await validator.validateDirectory(outputDir, MapSource.HOGNOSE);

  logger.info(`Valid levels: ${summary.validLevels}/${summary.totalLevels}`);
  if (summary.levelsWithErrors > 0) {
    logger.error(`Levels with errors: ${summary.levelsWithErrors}`);
  }
  if (summary.levelsWithWarnings > 0) {
    logger.warn(`Levels with warnings: ${summary.levelsWithWarnings}`);
  }

  // Check releases info
  const releasesPath = path.join(outputDir, 'hognose_releases.json');
  if (await fs.pathExists(releasesPath)) {
    const releases = await fs.readJSON(releasesPath);
    logger.info(`\nIndexed ${releases.length} Hognose releases`);
  }
}

// Run the test
testHognoseQuick().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
