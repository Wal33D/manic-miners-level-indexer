import { MasterIndexer } from './catalog/masterIndexer';
import { IndexerConfig, MapSource } from './types';
import { logger } from './utils/logger';
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
  const args = process.argv.slice(2);
  const sourceArg = args.find(arg => arg.startsWith('--source'));
  let source = null;

  if (sourceArg) {
    // Handle both --source=archive and --source archive formats
    if (sourceArg.includes('=')) {
      source = sourceArg.split('=')[1];
    } else {
      const sourceIndex = args.indexOf(sourceArg);
      if (sourceIndex < args.length - 1) {
        source = args[sourceIndex + 1];
      }
    }
  }

  logger.info('Manic Miners Level Indexer');
  logger.info('=========================');

  const config = await loadConfig();
  const masterIndexer = new MasterIndexer(config);

  try {
    if (source) {
      // Index specific source
      const validSources = Object.values(MapSource);
      if (!validSources.includes(source as MapSource)) {
        logger.error(`Invalid source: ${source}`);
        logger.info(`Valid sources: ${validSources.join(', ')}`);
        process.exit(1);
      }

      logger.info(`Indexing from source: ${source}`);
      await masterIndexer.indexSource(source as MapSource);
    } else {
      // Index all sources
      logger.info('Indexing from all enabled sources...');
      await masterIndexer.indexAll();
    }

    // Show final stats
    const stats = await masterIndexer.getCatalogStats();
    logger.info('\n=== Final Statistics ===');
    logger.info(`Total levels: ${stats.totalLevels}`);
    logger.info('By source:');
    Object.entries(stats.sources).forEach(([src, count]) => {
      logger.info(`  - ${src}: ${count}`);
    });

    logger.success('\nIndexing completed successfully!');
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

// Run the CLI
main();
