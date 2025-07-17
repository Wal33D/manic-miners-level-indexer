import { HognoseIndexer } from '../../src/indexers/hognoseIndexer';
import { CatalogManager } from '../../src/catalog/catalogManager';
import { MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function verifyHognoseComplete() {
  const outputDir = './test-output/integration/hognose-verification';
  const githubRepo = 'charredUtensil/hognose';

  // Clean start
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  logger.info('=== Starting Complete Hognose Verification ===');
  logger.info(`Output directory: ${outputDir}`);

  // Run the indexer
  const indexer = new HognoseIndexer(githubRepo, outputDir);
  const result = await indexer.indexHognose(progress => {
    logger.info(`[${progress.phase}] ${progress.message} - ${progress.current}/${progress.total}`);
  });

  logger.info(`\nIndexing Result:`);
  logger.info(`- Success: ${result.success}`);
  logger.info(`- Levels processed: ${result.levelsProcessed}`);
  logger.info(`- Levels skipped: ${result.levelsSkipped}`);
  logger.info(`- Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    logger.error('Errors encountered:');
    result.errors.forEach(err => logger.error(`  - ${err}`));
  }

  // Verify file structure
  logger.info('\n=== Verifying File Structure ===');

  const levelsDir = path.join(outputDir, 'levels');
  if (!(await fs.pathExists(levelsDir))) {
    logger.error('Levels directory does not exist!');
    return;
  }

  // Count actual directories
  const entries = await fs.readdir(levelsDir);
  const levelDirs: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(levelsDir, entry);
    const stat = await fs.stat(entryPath);
    if (stat.isDirectory()) {
      levelDirs.push(entry);
    }
  }

  logger.info(`\nPhysical level directories: ${levelDirs.length}`);

  // Verify each level has required files
  let completeCount = 0;
  let incompleteCount = 0;
  const missingFiles: string[] = [];

  for (const levelDir of levelDirs) {
    const dirPath = path.join(levelsDir, levelDir);
    const files = await fs.readdir(dirPath);

    // Check for required files
    const hasCatalog = files.includes('catalog.json');
    const hasDat = files.some(f => f.endsWith('.dat'));

    if (hasCatalog && hasDat) {
      completeCount++;
    } else {
      incompleteCount++;
      const missing = [];
      if (!hasCatalog) missing.push('catalog.json');
      if (!hasDat) missing.push('.dat file');
      missingFiles.push(`${levelDir}: missing ${missing.join(', ')}`);
    }
  }

  logger.info(`\nFile verification:`);
  logger.info(`- Complete levels: ${completeCount}`);
  logger.info(`- Incomplete levels: ${incompleteCount}`);

  if (missingFiles.length > 0) {
    logger.warn('\nIncomplete levels:');
    missingFiles.slice(0, 5).forEach(m => logger.warn(`  - ${m}`));
    if (missingFiles.length > 5) {
      logger.warn(`  ... and ${missingFiles.length - 5} more`);
    }
  }

  // Rebuild and verify catalog
  logger.info('\n=== Verifying Catalog Index ===');

  const catalogManager = new CatalogManager(outputDir);
  await catalogManager.rebuildCatalogIndex();

  const allLevels = await catalogManager.getAllLevels();
  const hognoseLevels = await catalogManager.getLevelsBySource(MapSource.HOGNOSE);

  logger.info(`\nCatalog verification:`);
  logger.info(`- Total levels in catalog: ${allLevels.length}`);
  logger.info(`- Hognose levels in catalog: ${hognoseLevels.length}`);

  // Sample some level names to verify content
  logger.info('\n=== Sample Level Names ===');
  const sampleSize = 10;
  for (let i = 0; i < Math.min(sampleSize, hognoseLevels.length); i++) {
    const level = hognoseLevels[i];
    logger.info(`  ${i + 1}. ${level.metadata.title} (${level.files.length} files)`);
  }

  // Final summary
  logger.info('\n=== FINAL SUMMARY ===');
  logger.info(`Expected: 256 levels`);
  logger.info(`Indexed: ${result.levelsProcessed} levels`);
  logger.info(`Physical directories: ${levelDirs.length}`);
  logger.info(`Catalog entries: ${hognoseLevels.length}`);
  logger.info(`Complete levels: ${completeCount}`);

  if (
    result.levelsProcessed === 256 &&
    levelDirs.length === 256 &&
    hognoseLevels.length === 256 &&
    completeCount === 256
  ) {
    logger.success('\n✅ ALL 256 LEVELS SUCCESSFULLY INDEXED WITH COMPLETE FILES!');
  } else {
    logger.error('\n❌ VERIFICATION FAILED - Not all levels were properly indexed');
  }

  // Check file sizes
  logger.info('\n=== Checking File Sizes ===');
  for (let i = 0; i < Math.min(5, levelDirs.length); i++) {
    const dirPath = path.join(levelsDir, levelDirs[i]);
    const files = await fs.readdir(dirPath);
    let dirSize = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      dirSize += stat.size;
    }

    logger.info(`  ${levelDirs[i]}: ${(dirSize / 1024).toFixed(2)} KB`);
  }
  logger.info(`  ... (showing first 5 of ${levelDirs.length})`);
}

verifyHognoseComplete().catch(error => {
  logger.error('Verification failed:', error);
  process.exit(1);
});
