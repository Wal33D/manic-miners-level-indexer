import dotenv from 'dotenv';
import { DiscordUnifiedIndexer } from '../../src/indexers/discordUnified';
import { logger } from '../../src/utils/logger';
import { FileUtils } from '../../src/utils/fileUtils';
import { Level } from '../../src/types';
import path from 'path';
import fs from 'fs-extra';

dotenv.config();

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-data');

async function testDiscordSmall() {
  try {
    logger.info('=== Discord Test (Limited to 3 levels) ===');

    // Clean up test directory
    await fs.remove(TEST_OUTPUT_DIR);
    await fs.ensureDir(TEST_OUTPUT_DIR);

    // Create modified processed messages file to limit indexing
    const processedPath = path.join(TEST_OUTPUT_DIR, 'discord_direct_processed.json');
    await fs.writeJSON(processedPath, []); // Start fresh

    // Test with both channels
    const TEST_CHANNELS = [
      '683985075704299520', // Old pre-v1 maps
      '1139908458968252457', // Community levels (v1+)
    ];

    logger.info('Initializing Discord unified indexer...');
    logger.info('Testing channels:');
    logger.info('  - 683985075704299520 (Old pre-v1 maps)');
    logger.info('  - 1139908458968252457 (Community levels v1+)');
    const discordIndexer = new DiscordUnifiedIndexer(TEST_CHANNELS, TEST_OUTPUT_DIR);

    // Monkey patch to limit messages per channel
    const messageCountPerChannel: Record<string, number> = {};
    const maxMessagesPerChannel = 10;
    const originalProcess = (discordIndexer as any).processDiscordMessage;
    (discordIndexer as any).processDiscordMessage = async function (
      message: any,
      channelId: string,
      ...args: any[]
    ) {
      if (!messageCountPerChannel[channelId]) {
        messageCountPerChannel[channelId] = 0;
      }
      if (messageCountPerChannel[channelId] >= maxMessagesPerChannel) {
        logger.info(
          `Skipping message in channel ${channelId} (reached limit of ${maxMessagesPerChannel} per channel)`
        );
        return [];
      }
      const result = await originalProcess.apply(this, [message, channelId, ...args]);
      if (result.length > 0) {
        messageCountPerChannel[channelId]++;
      }
      return result;
    };

    // Run the indexer
    const result = await discordIndexer.indexDiscord(progress => {
      logger.info(`${progress.phase}: ${progress.message} (${progress.current}/${progress.total})`);
    });

    logger.info(`\nIndexing result: ${result.levelsProcessed} levels processed`);
    logger.info(`Messages processed per channel:`);
    Object.entries(messageCountPerChannel).forEach(([channelId, count]) => {
      const channelName =
        channelId === '683985075704299520' ? 'Old pre-v1 maps' : 'Community levels (v1+)';
      logger.info(`  - ${channelName}: ${count} messages`);
    });

    if (result.levelsProcessed > 0) {
      // Find the first level
      const levelDirs = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'levels-discord'));
      if (levelDirs.length > 0) {
        const firstLevelDir = levelDirs[0];
        const catalogPath = path.join(
          TEST_OUTPUT_DIR,
          'levels-discord',
          firstLevelDir,
          'catalog.json'
        );
        const level = await FileUtils.readJSON<Level>(catalogPath);

        if (level) {
          logger.info(`\nAnalyzing level: ${level.metadata.title}`);
          logger.info(`DAT file path: ${level.datFilePath}`);
          logger.info(`File size: ${level.metadata.fileSize} bytes`);
          logger.info(`Format version: ${level.metadata.formatVersion}`);
          logger.info(`Tags: ${level.metadata.tags?.join(', ')}`);
        }
      }
    }

    // List all downloaded files
    logger.info('\n=== Downloaded Files ===');
    const allFiles = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'levels-discord'), {
      withFileTypes: true,
    });
    for (const dir of allFiles.filter(f => f.isDirectory())) {
      const levelFiles = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'levels-discord', dir.name));
      logger.info(`${dir.name}:`);
      for (const file of levelFiles) {
        const stats = await fs.stat(path.join(TEST_OUTPUT_DIR, 'levels-discord', dir.name, file));
        logger.info(`  - ${file} (${stats.size} bytes)`);
      }
    }
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Run the test
testDiscordSmall().catch(console.error);
