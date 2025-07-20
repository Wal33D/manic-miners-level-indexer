import { MasterIndexer } from '../src/catalog/masterIndexer';
import { IndexerConfig, MapSource } from '../src/types';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function loadConfig(): Promise<IndexerConfig> {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!(await fs.pathExists(configPath))) {
    logger.error('config.json not found in current directory');
    logger.info(
      `Please create a config.json file with the following structure:\n${JSON.stringify(
        {
          outputDir: './output',
          sources: {
            discord_archive: {
              enabled: true,
              channels: ['683985075704299520'],
              retryAttempts: 3,
              downloadTimeout: 60000,
              skipExisting: true,
            },
          },
        },
        null,
        2
      )}`
    );
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
  logger.header('Manic Miners Level Indexer - Discord Archive Source');

  const config = await loadConfig();
  const masterIndexer = new MasterIndexer(config);

  try {
    logger.section('Starting Discord Archive indexing');
    await masterIndexer.indexSource(MapSource.DISCORD_ARCHIVE);

    // Show final stats
    const stats = await masterIndexer.getCatalogStats();
    logger.section('Final Statistics');
    logger.stats({
      'Total levels': stats.totalLevels,
      'Discord Archive levels': stats.sources[MapSource.DISCORD_ARCHIVE] || 0,
      'Last updated': new Date(stats.lastUpdated).toLocaleString(),
    });

    logger.success('\nDiscord Archive indexing completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Discord Archive indexing failed:', error);
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
