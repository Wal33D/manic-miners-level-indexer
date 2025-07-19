import { CatalogIndex, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { logger } from '../src/utils/logger';
import path from 'path';

async function testDiscordChannelExtraction() {
  logger.info('🧪 Testing Discord Channel Extraction...\n');

  // Load catalog
  const catalogPath = path.join('output', 'catalog_index.json');
  const catalog = await FileUtils.readJSON<CatalogIndex>(catalogPath);

  if (!catalog) {
    logger.error('Could not load catalog index');
    return;
  }

  // Get all Discord levels
  const discordLevels = catalog.levels.filter(level => level.metadata.source === MapSource.DISCORD);

  // Extract all unique channel IDs
  const channelIds = new Set<string>();
  const serverIds = new Set<string>();
  const urlPatterns = new Set<string>();
  let validUrls = 0;
  let invalidUrls = 0;
  const sampleUrls: string[] = [];

  for (const level of discordLevels) {
    const url = level.metadata.sourceUrl;

    if (!url) {
      invalidUrls++;
      continue;
    }

    // Track URL patterns
    if (url.includes('discord.com')) {
      urlPatterns.add(url.split('?')[0].replace(/\/\d+/g, '/{id}'));
    }

    // Extract IDs
    const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?/);
    if (match) {
      validUrls++;
      serverIds.add(match[1]);
      channelIds.add(match[2]);

      if (sampleUrls.length < 5) {
        sampleUrls.push(url);
      }
    } else {
      invalidUrls++;
      logger.warn(`Could not parse Discord URL: ${url}`);
    }
  }

  // Display results
  logger.info('📊 Discord URL Analysis Results:\n');
  logger.info(`Total Discord Levels: ${discordLevels.length}`);
  logger.info(`Valid Discord URLs: ${validUrls}`);
  logger.info(`Invalid/Missing URLs: ${invalidUrls}`);
  logger.info(`Unique Servers: ${serverIds.size}`);
  logger.info(`Unique Channels: ${channelIds.size}`);

  logger.info('\n📍 Server IDs found:');
  serverIds.forEach(id => logger.info(`  - ${id}`));

  logger.info('\n📍 Channel IDs found:');
  channelIds.forEach(id => logger.info(`  - ${id}`));

  logger.info('\n🔗 URL Patterns found:');
  urlPatterns.forEach(pattern => logger.info(`  - ${pattern}`));

  logger.info('\n📝 Sample URLs:');
  sampleUrls.forEach(url => logger.info(`  - ${url}`));

  // Create a detailed channel map
  const channelMap = new Map<string, { count: number; server: string; messages: Set<string> }>();

  for (const level of discordLevels) {
    const url = level.metadata.sourceUrl;
    if (!url) continue;

    const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?/);
    if (match) {
      const [, serverId, channelId, messageId] = match;

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          count: 0,
          server: serverId,
          messages: new Set(),
        });
      }

      const info = channelMap.get(channelId);
      if (!info) continue;
      info.count++;
      if (messageId) {
        info.messages.add(messageId);
      }
    }
  }

  logger.info('\n📊 Levels per Channel:');
  const sortedChannels = Array.from(channelMap.entries()).sort(([, a], [, b]) => b.count - a.count);

  for (const [channelId, info] of sortedChannels) {
    const percentage = ((info.count / validUrls) * 100).toFixed(1);
    logger.info(`  Channel ${channelId}: ${info.count} levels (${percentage}%)`);
    logger.info(`    Server: ${info.server}`);
    logger.info(`    Unique messages: ${info.messages.size}`);
  }

  // Save detailed report
  const report = {
    timestamp: new Date(),
    summary: {
      totalDiscordLevels: discordLevels.length,
      validUrls,
      invalidUrls,
      uniqueServers: serverIds.size,
      uniqueChannels: channelIds.size,
    },
    servers: Array.from(serverIds),
    channels: sortedChannels.map(([channelId, info]) => ({
      channelId,
      serverId: info.server,
      levelCount: info.count,
      percentage: ((info.count / validUrls) * 100).toFixed(1),
      uniqueMessages: info.messages.size,
    })),
    urlPatterns: Array.from(urlPatterns),
    sampleUrls,
  };

  const reportPath = path.join('output', 'discord-channel-test-report.json');
  await FileUtils.writeJSON(reportPath, report);
  logger.info(`\n✅ Test report saved to: ${reportPath}`);
}

// Run the test
testDiscordChannelExtraction().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
