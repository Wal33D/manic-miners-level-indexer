import { MasterIndexer } from '../src/catalog/masterIndexer';
import { IndexerConfig } from '../src/types';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

async function loadConfig(): Promise<IndexerConfig> {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!(await fs.pathExists(configPath))) {
    logger.error('config.json not found in current directory');
    logger.info(
      `Please create a config.json file with the following structure:\n${JSON.stringify(
        {
          outputDir: './output',
          sources: {
            internet_archive: {
              enabled: true,
              baseUrl: 'https://archive.org/advancedsearch.php',
            },
            discord_community: {
              enabled: true,
              channels: ['1139908458968252457'],
            },
            discord_archive: {
              enabled: true,
              channels: ['683985075704299520'],
            },
            hognose: {
              enabled: true,
              githubRepo: 'charredUtensil/groundhog',
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
  logger.info('Manic Miners Level Indexer - Index All Sources');
  logger.info('=============================================');

  const config = await loadConfig();
  const masterIndexer = new MasterIndexer(config);

  try {
    logger.info('Indexing from all enabled sources...');
    await masterIndexer.indexAll();

    // Show final stats
    const stats = await masterIndexer.getCatalogStats();
    logger.info('\n=== Final Statistics ===');
    logger.info(`Total levels: ${stats.totalLevels}`);
    logger.info('By source:');
    Object.entries(stats.sources).forEach(([src, count]) => {
      logger.info(`  - ${src}: ${count}`);
    });

    logger.success('\nIndexing completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Indexing failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', error => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the script
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
