import { ArchiveIndexer } from './src/indexers/archiveIndexer';
import { logger } from './src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testArchiveIndexer() {
  const outputDir = './test-output';
  const baseUrl = 'https://archive.org/advancedsearch.php';
  
  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  
  logger.info('Starting Internet Archive indexer test...');
  logger.info('Output directory:', outputDir);
  
  // Test with different concurrent download settings
  const concurrentDownloads = 10; // Increased for faster downloads
  
  const indexer = new ArchiveIndexer(
    baseUrl,
    999, // Get all available items
    outputDir,
    concurrentDownloads
  );
  
  const startTime = Date.now();
  let lastProgressTime = Date.now();
  let lastProgressCount = 0;
  
  const result = await indexer.indexArchive((progress) => {
    const currentTime = Date.now();
    const timeDiff = (currentTime - lastProgressTime) / 1000;
    const itemsDiff = progress.current - lastProgressCount;
    const itemsPerSecond = timeDiff > 0 ? (itemsDiff / timeDiff).toFixed(2) : '0';
    
    logger.info(`[${progress.phase}] ${progress.message}`);
    
    if (progress.phase === 'downloading' && timeDiff > 5) {
      logger.info(`Speed: ${itemsPerSecond} items/sec`);
      lastProgressTime = currentTime;
      lastProgressCount = progress.current;
    }
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
  logger.info(`Average speed: ${(result.levelsProcessed / (duration / 1000)).toFixed(2)} levels/sec`);
  logger.info(`Concurrent downloads: ${concurrentDownloads}`);
  
  if (result.errors.length > 0) {
    logger.warn('\nFirst 5 errors:');
    result.errors.slice(0, 5).forEach(err => logger.warn(`- ${err}`));
  }
  
  // Check what was downloaded
  const levelsDir = path.join(outputDir, 'levels');
  if (await fs.pathExists(levelsDir)) {
    const levelDirs = await fs.readdir(levelsDir);
    logger.info(`\nCreated ${levelDirs.length} level directories`);
    
    // Sample check of first few levels
    const sampleSize = Math.min(5, levelDirs.length);
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
}

// Run the test
testArchiveIndexer().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});