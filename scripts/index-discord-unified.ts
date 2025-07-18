import dotenv from 'dotenv';
import { DiscordUnifiedIndexer } from '../src/indexers/discordUnified';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';
import ProgressBar from 'progress';
import { IndexerProgress } from '../src/types';

dotenv.config();

const DISCORD_CHANNELS = [
  '683985075704299520', // Old pre-v1 maps
  '1139908458968252457', // Community levels (v1+)
];

const OUTPUT_DIR = './data';

async function main() {
  logger.info(chalk.blue('🤖 Starting Unified Discord Indexer...'));
  logger.info(`Output directory: ${OUTPUT_DIR}`);
  logger.info(`Channels to index: ${DISCORD_CHANNELS.length}`);
  logger.info('  - 683985075704299520 (Old pre-v1 maps)');
  logger.info('  - 1139908458968252457 (Community levels v1+)');

  const indexer = new DiscordUnifiedIndexer(DISCORD_CHANNELS, OUTPUT_DIR);

  let progressBar: ProgressBar | null = null;

  const progressCallback = (progress: IndexerProgress) => {
    if (progress.phase === 'scraping') {
      if (progressBar) {
        (progressBar as any).terminate();
      }
      logger.info(progress.message);
    } else if (progress.phase === 'downloading') {
      if (!progressBar && progress.total > 0) {
        progressBar = new ProgressBar('  downloading [:bar] :percent :current/:total :etas', {
          total: progress.total,
          width: 40,
          complete: '█',
          incomplete: '░',
        });
      }
      if (progressBar) {
        progressBar.update(progress.current / progress.total);
      }
    }
  };

  try {
    const result = await indexer.indexDiscord(progressCallback);

    if (progressBar) {
      (progressBar as any).terminate();
    }

    if (result.success) {
      logger.success(chalk.green(`\n✅ Discord indexing completed successfully!`));
      logger.info(`📊 Statistics:`);
      logger.info(`   - Levels processed: ${result.levelsProcessed}`);
      logger.info(`   - Levels skipped: ${result.levelsSkipped}`);
      logger.info(`   - Duration: ${Math.round(result.duration / 1000)}s`);

      if (result.errors.length > 0) {
        logger.warn(`\n⚠️  Errors encountered:`);
        result.errors.forEach(error => logger.error(`   - ${error}`));
      }
    } else {
      logger.error(chalk.red(`\n❌ Discord indexing failed!`));
      if (result.errors.length > 0) {
        logger.error(`Errors:`);
        result.errors.forEach(error => logger.error(`   - ${error}`));
      }
    }
  } catch (error) {
    logger.error(chalk.red('Fatal error during indexing:'), error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--clear-auth')) {
  logger.info('Clearing authentication cache...');
  const indexer = new DiscordUnifiedIndexer(DISCORD_CHANNELS, OUTPUT_DIR);
  indexer
    .clearAuthCache()
    .then(() => {
      logger.success('Authentication cache cleared!');
      return main();
    })
    .catch(error => {
      logger.error('Failed to clear auth cache:', error);
      process.exit(1);
    });
} else {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}
