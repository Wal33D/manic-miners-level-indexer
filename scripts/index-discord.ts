import { MasterIndexer } from '../src/catalog/masterIndexer';
import { IndexerConfig, MapSource } from '../src/types';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function loadConfig(): Promise<IndexerConfig> {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!(await fs.pathExists(configPath))) {
    logger.error('config.json not found in current directory');
    logger.info('Please create a config.json file based on config.template.json');
    process.exit(1);
  }

  try {
    const config = await fs.readJSON(configPath);
    return config;
  } catch (error) {
    logger.error('Failed to load config.json:', error);
    process.exit(1);
  }
}

async function main() {
  logger.info('Manic Miners Level Indexer - Discord Source');
  logger.info('==========================================');

  const config = await loadConfig();
  const masterIndexer = new MasterIndexer(config);

  try {
    logger.info('Indexing from Discord source...');
    await masterIndexer.indexSource(MapSource.DISCORD);

    // Show final stats
    const stats = await masterIndexer.getCatalogStats();
    logger.info('\n=== Final Statistics ===');
    logger.info(`Total levels: ${stats.totalLevels}`);
    logger.info(`Discord levels: ${stats.sources[MapSource.DISCORD] || 0}`);

    logger.success('\nDiscord indexing completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Discord indexing failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', error => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the script
main();
