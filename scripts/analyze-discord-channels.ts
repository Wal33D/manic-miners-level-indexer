import { CatalogIndex, Level, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { logger } from '../src/utils/logger';
import path from 'path';
import fs from 'fs-extra';

interface ChannelInfo {
  id: string;
  name?: string;
  levelCount: number;
  levels: Array<{
    id: string;
    title: string;
    author: string;
    uploadDate?: Date;
  }>;
}

// Known Discord channel mappings (from common Manic Miners Discord servers)
const KNOWN_CHANNELS: Record<string, string> = {
  '683985075704299520': 'community-levels', // Main community levels channel
  '686259899138834485': 'community-levels', // Alternate ID seen in data
  '580269696369164299': 'manic-miners-server', // Server ID
};

async function analyzeDiscordChannels() {
  logger.info('🔍 Analyzing Discord Level Channels...\n');

  // Load the main catalog
  const catalogPath = path.join('output', 'catalog_index.json');
  const catalog = await FileUtils.readJSON<CatalogIndex>(catalogPath);

  if (!catalog) {
    logger.error('Could not load catalog index');
    return;
  }

  // Filter Discord levels
  const discordLevels = catalog.levels.filter(level => level.metadata.source === MapSource.DISCORD);

  logger.info(`Found ${discordLevels.length} Discord levels\n`);

  // Analyze channels
  const channelMap = new Map<string, ChannelInfo>();

  for (const level of discordLevels) {
    const sourceUrl = level.metadata.sourceUrl;
    if (!sourceUrl || !sourceUrl.includes('discord.com/channels/')) {
      continue;
    }

    // Extract channel ID from URL
    // Format: https://discord.com/channels/{serverId}/{channelId}/{messageId}
    const urlParts = sourceUrl.split('/');
    const channelIndex = urlParts.indexOf('channels');

    if (channelIndex === -1 || urlParts.length < channelIndex + 3) {
      logger.warn(`Invalid Discord URL format: ${sourceUrl}`);
      continue;
    }

    const serverId = urlParts[channelIndex + 1];
    const channelId = urlParts[channelIndex + 2];
    const messageId = urlParts[channelIndex + 3];

    // Create composite key for server+channel
    const channelKey = `${serverId}/${channelId}`;

    if (!channelMap.has(channelKey)) {
      channelMap.set(channelKey, {
        id: channelKey,
        name: KNOWN_CHANNELS[channelId] || `channel-${channelId}`,
        levelCount: 0,
        levels: [],
      });
    }

    const channelInfo = channelMap.get(channelKey);
    if (!channelInfo) continue;
    channelInfo.levelCount++;
    channelInfo.levels.push({
      id: level.metadata.id,
      title: level.metadata.title,
      author: level.metadata.author,
      uploadDate: level.metadata.postedDate,
    });
  }

  // Sort channels by level count
  const sortedChannels = Array.from(channelMap.values()).sort(
    (a, b) => b.levelCount - a.levelCount
  );

  // Display results
  logger.info('📊 Discord Channel Distribution:\n');

  for (const channel of sortedChannels) {
    const [serverId, channelId] = channel.id.split('/');
    logger.info(`Channel: ${channel.name} (${channelId})`);
    logger.info(`  Server ID: ${serverId}`);
    logger.info(`  Level Count: ${channel.levelCount}`);
    logger.info(`  Percentage: ${((channel.levelCount / discordLevels.length) * 100).toFixed(1)}%`);
    logger.info('');
  }

  // Show sample levels from each channel
  logger.info('\n📋 Sample Levels by Channel:\n');

  for (const channel of sortedChannels) {
    const [serverId, channelId] = channel.id.split('/');
    logger.info(`\n${channel.name} (${channelId}) - Top 5 levels:`);

    // Sort levels by date (newest first)
    const sortedLevels = channel.levels
      .sort((a, b) => {
        const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    for (const level of sortedLevels) {
      const date = level.uploadDate
        ? new Date(level.uploadDate).toLocaleDateString()
        : 'Unknown date';
      logger.info(`  - "${level.title}" by ${level.author} (${date})`);
    }
  }

  // Generate detailed report
  const report = {
    generatedAt: new Date(),
    totalDiscordLevels: discordLevels.length,
    channelCount: channelMap.size,
    channels: sortedChannels.map(channel => {
      const [serverId, channelId] = channel.id.split('/');
      return {
        serverId,
        channelId,
        name: channel.name,
        levelCount: channel.levelCount,
        percentage: ((channel.levelCount / discordLevels.length) * 100).toFixed(1),
        levels: channel.levels.sort((a, b) => {
          const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
          const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
          return dateB - dateA;
        }),
      };
    }),
  };

  // Save report
  const reportPath = path.join('output', 'discord-channel-analysis.json');
  await FileUtils.writeJSON(reportPath, report);
  logger.info(`\n📄 Detailed report saved to: ${reportPath}`);

  // Check for levels without proper channel info
  const levelsWithoutChannel = discordLevels.filter(
    level =>
      !level.metadata.sourceUrl || !level.metadata.sourceUrl.includes('discord.com/channels/')
  );

  if (levelsWithoutChannel.length > 0) {
    logger.warn(
      `\n⚠️  Found ${levelsWithoutChannel.length} Discord levels without channel information`
    );
  }
}

// Run the analysis
analyzeDiscordChannels().catch(error => {
  logger.error('Error analyzing Discord channels:', error);
  process.exit(1);
});
