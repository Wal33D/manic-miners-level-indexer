import dotenv from 'dotenv';
import { DiscordUnifiedIndexer } from '../src/indexers/discordUnified';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';
import ProgressBar from 'progress';
import { IndexerProgress, MapSource } from '../src/types';

dotenv.config();

const DISCORD_CHANNELS = {
  archive: ['683985075704299520'], // Old pre-v1 maps
  community: ['1139908458968252457'], // Community levels (v1+)
};

const OUTPUT_DIR = './output';

async function main() {
  const args = process.argv.slice(2);
  const source = args.includes('--archive') ? 'archive' : 'community';
  const channels = source === 'archive' ? DISCORD_CHANNELS.archive : DISCORD_CHANNELS.community;
  const mapSource = source === 'archive' ? MapSource.DISCORD_ARCHIVE : MapSource.DISCORD_COMMUNITY;

  logger.info(
    chalk.blue(`🤖 Starting Discord ${source.charAt(0).toUpperCase() + source.slice(1)} Indexer...`)
  );
  logger.info(`Output directory: ${OUTPUT_DIR}`);
  logger.info(`Source: ${source}`);
  logger.info(`Channels to index: ${channels.join(', ')}`);

  const indexer = new DiscordUnifiedIndexer(channels, OUTPUT_DIR, mapSource);

  let progressBar: ProgressBar | undefined;

  const progressCallback = (progress: IndexerProgress) => {
    if (progress.phase === 'scraping') {
      if (progressBar) {
        progressBar.terminate();
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
      progressBar.terminate();
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
if (process.argv.includes('--clear-auth')) {
  logger.info('Clearing authentication cache...');
  // Create a temporary indexer just to clear auth cache
  const tempIndexer = new DiscordUnifiedIndexer(
    ['temporary'],
    OUTPUT_DIR,
    MapSource.DISCORD_COMMUNITY
  );
  tempIndexer
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
