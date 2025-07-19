import { DiscordUnifiedIndexer } from '../../src/indexers/discordUnified';
import { MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function testAuthTrigger() {
  logger.info('=== Testing What Triggers Auth ===\n');

  logger.info(`DISCORD_TOKEN present: ${!!process.env.DISCORD_TOKEN}`);

  try {
    logger.info('Creating DiscordUnifiedIndexer instance...');
    const indexer = new DiscordUnifiedIndexer(
      ['1139908458968252457'],
      './test-output',
      MapSource.DISCORD_COMMUNITY
    );

    logger.info('Instance created successfully');
    logger.info('No auth triggered yet!');

    logger.info('\nNow calling indexDiscord()...');
    await indexer.indexDiscord();
  } catch (error) {
    logger.error('Error:', error);
  }
}

testAuthTrigger().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
