import dotenv from 'dotenv';
import { DiscordDirectAPI } from '../src/indexers/discordDirectAPI';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';
import ProgressBar from 'progress';
import { IndexerProgress } from '../src/types';

dotenv.config();

const DISCORD_CHANNELS = [
  '683985075704299520', // Old pre-v1 maps channel
  '1139908458968252457', // The community-levels forum channel (v1+)
];

const OUTPUT_DIR = './data';

async function main() {
  logger.info(chalk.blue('🤖 Starting Discord Direct API Indexer...'));
  logger.info(`Output directory: ${OUTPUT_DIR}`);
  logger.info(`Channels to index: ${DISCORD_CHANNELS.length}`);

  const indexer = new DiscordDirectAPI(DISCORD_CHANNELS, OUTPUT_DIR);

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
      logger.success(
        chalk.green(
          `\n✅ Discord indexing completed successfully!\n` +
            `   Levels processed: ${result.levelsProcessed}\n` +
            `   Levels skipped: ${result.levelsSkipped}\n` +
            `   Duration: ${(result.duration / 1000).toFixed(2)}s`
        )
      );
    } else {
      logger.error(chalk.red('\n❌ Discord indexing failed!'));
      result.errors.forEach(error => logger.error(`   - ${error}`));
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error(chalk.red(`\n❌ Unexpected error: ${error}`));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info(chalk.yellow('\n\n🛑 Indexing interrupted by user'));
  process.exit(1);
});

main().catch(error => {
  logger.error(chalk.red(`\n❌ Fatal error: ${error}`));
  process.exit(1);
});
