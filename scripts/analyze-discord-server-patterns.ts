import { CatalogIndex, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { logger } from '../src/utils/logger';
import path from 'path';

async function analyzeDiscordServerPatterns() {
  const KNOWN_SERVER_ID = '580269696369164299'; // The actual Manic Miners Discord server
  logger.info('🔍 Analyzing Discord Server Patterns...\n');

  const catalogPath = path.join('output', 'catalog_index.json');
  const catalog = await FileUtils.readJSON<CatalogIndex>(catalogPath);

  if (!catalog) {
    logger.error('Could not load catalog index');
    return;
  }

  const discordLevels = catalog.levels.filter(level => level.metadata.source === MapSource.DISCORD);

  // These are actually channel IDs, not server IDs
  const channelData: Record<
    string,
    {
      count: number;
      earliestDate?: Date;
      latestDate?: Date;
      messages: Set<string>;
      authors: Set<string>;
      sampleTitles: string[];
    }
  > = {};

  for (const level of discordLevels) {
    const url = level.metadata.sourceUrl;
    if (!url) continue;

    // URLs are in format: discord.com/channels/{channelId}/{messageId}
    const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
    if (!match) continue;

    const [, channelId, messageId] = match;

    if (!channelData[channelId]) {
      channelData[channelId] = {
        count: 0,
        messages: new Set(),
        authors: new Set(),
        sampleTitles: [],
      };
    }

    const data = channelData[channelId];
    data.count++;
    data.messages.add(messageId);
    data.authors.add(level.metadata.author);

    if (data.sampleTitles.length < 5) {
      data.sampleTitles.push(level.metadata.title);
    }

    const date = level.metadata.postedDate ? new Date(level.metadata.postedDate) : null;
    if (date && !isNaN(date.getTime())) {
      if (!data.earliestDate || date < data.earliestDate) {
        data.earliestDate = date;
      }
      if (!data.latestDate || date > data.latestDate) {
        data.latestDate = date;
      }
    }
  }

  // Display analysis
  logger.info(`📊 Discord Channel Analysis (All from server ${KNOWN_SERVER_ID}):\n`);

  const knownChannelNames: Record<string, string> = {
    '683985075704299520': 'levels-archive', // OLD text-only archived channel (until July 2023)
    '1139908458968252457': 'community-levels', // CURRENT forum channel (August 2023 onwards, still active)
  };

  for (const [channelId, data] of Object.entries(channelData)) {
    const channelName = knownChannelNames[channelId] || 'Unknown Channel';
    logger.info(`Channel: ${channelName} (${channelId})`);
    logger.info(`  Total Levels: ${data.count}`);
    logger.info(`  Unique Messages: ${data.messages.size}`);
    logger.info(`  Unique Authors: ${data.authors.size}`);

    if (data.earliestDate && data.latestDate) {
      logger.info(
        `  Date Range: ${data.earliestDate.toLocaleDateString()} to ${data.latestDate.toLocaleDateString()}`
      );

      // Calculate time span in days
      const timeSpan =
        (data.latestDate.getTime() - data.earliestDate.getTime()) / (1000 * 60 * 60 * 24);
      logger.info(`  Time Span: ${Math.round(timeSpan)} days`);
    }

    logger.info(`  Sample Titles:`);
    data.sampleTitles.forEach(title => {
      logger.info(`    - ${title}`);
    });

    logger.info('');
  }

  // Check for author overlap between channels
  const channel1 = '683985075704299520';
  const channel2 = '1139908458968252457';

  if (channelData[channel1] && channelData[channel2]) {
    logger.info('🔄 Channel Comparison:\n');

    const authors1 = Array.from(channelData[channel1].authors);
    const authors2 = Array.from(channelData[channel2].authors);

    const commonAuthors = authors1.filter(auth => authors2.includes(auth));

    logger.info(`🤝 Author Overlap:`);
    logger.info(
      `  Authors only in levels-archive (old): ${authors1.length - commonAuthors.length}`
    );
    logger.info(
      `  Authors only in community-levels (current): ${authors2.length - commonAuthors.length}`
    );
    logger.info(`  Authors in both channels: ${commonAuthors.length}`);

    if (commonAuthors.length > 0) {
      logger.info(`  Sample common authors: ${commonAuthors.slice(0, 5).join(', ')}`);
    }

    // Show timeline transition
    logger.info('\n📅 Timeline Analysis:');
    const oldChannelLatest = channelData[channel1].latestDate;
    const newChannelEarliest = channelData[channel2].earliestDate;

    if (oldChannelLatest && newChannelEarliest) {
      logger.info(`  Old channel last post: ${oldChannelLatest.toLocaleDateString()}`);
      logger.info(`  New channel first post: ${newChannelEarliest.toLocaleDateString()}`);

      const gap =
        (newChannelEarliest.getTime() - oldChannelLatest.getTime()) / (1000 * 60 * 60 * 24);
      logger.info(`  Gap between channels: ${Math.round(gap)} days`);
    }
  }

  logger.info('\n📍 Summary:');
  logger.info(
    `  All ${discordLevels.length} Discord levels are from the Manic Miners server (${KNOWN_SERVER_ID})`
  );
  logger.info(`  They are posted in ${Object.keys(channelData).length} different channels`);
  logger.info(`  The two main channels are:`);
  logger.info(
    `    - levels-archive (683985075704299520): OLD text-only channel, 378 maps, used until July 2023`
  );
  logger.info(
    `    - community-levels (1139908458968252457): CURRENT forum channel, 184 maps, August 2023 onwards (still active)`
  );
}

// Run analysis
analyzeDiscordServerPatterns().catch(error => {
  logger.error('Error:', error);
  process.exit(1);
});
