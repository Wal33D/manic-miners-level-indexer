import { MasterIndexer } from '../src/catalog/masterIndexer';
import { IndexerConfig, MapSource } from '../src/types';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

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
  logger.header('Manic Miners Level Indexer - Discord Community Source');

  const config = await loadConfig();
  const masterIndexer = new MasterIndexer(config);

  try {
    logger.section('Starting Discord Community indexing');
    await masterIndexer.indexSource(MapSource.DISCORD_COMMUNITY);

    // Show final stats
    const stats = await masterIndexer.getCatalogStats();
    logger.section('Final Statistics');
    logger.stats({
      'Total levels': stats.totalLevels,
      'Discord Community levels': stats.sources[MapSource.DISCORD_COMMUNITY] || 0,
      'Last updated': new Date(stats.lastUpdated).toLocaleString(),
    });

    logger.success('\nDiscord Community indexing completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Discord Community indexing failed:', error);
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
