import { DiscordIndexer } from './src/indexers/discordIndexer';
import { logger } from './src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testDiscordIndexer() {
  const outputDir = './test-output';
  const channels = [
    'https://discord.com/channels/580269696369164299/1139908458968252457'
  ];
  
  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  
  logger.info('Starting Discord indexer test...');
  logger.info('Output directory:', outputDir);
  logger.info('Channels to index:', channels);
  
  const indexer = new DiscordIndexer(
    channels,
    999, // Get all available messages
    outputDir
  );
  
  const startTime = Date.now();
  
  const result = await indexer.indexDiscord((progress) => {
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
        logger.info(`- ${catalog.metadata.title} by ${catalog.metadata.author}: ${files.length} files`);
      }
    }
  }
}

// Run the test
testDiscordIndexer().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});