import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../src/utils/logger';

dotenv.config();

async function countBothChannels() {
  const token = process.env.DISCORD_USER_TOKEN;
  if (!token) {
    throw new Error('DISCORD_USER_TOKEN not found');
  }

  const headers = {
    Authorization: token,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  const channels = [
    { id: '683985075704299520', name: 'Old pre-v1 maps' },
    { id: '1139908458968252457', name: 'Community levels (v1+)' },
  ];

  const totalLevels = 0;
  let totalThreads = 0;

  for (const channel of channels) {
    logger.info(`\n=== Checking ${channel.name} ===`);

    // Get channel info
    const channelResponse = await fetch(`https://discord.com/api/v9/channels/${channel.id}`, {
      headers,
    });
    if (channelResponse.ok) {
      const channelInfo = await channelResponse.json();
      logger.info(`Channel type: ${channelInfo.type} (${channelInfo.name})`);

      if (channelInfo.type === 0) {
        // Regular text channel - count messages
        const msgResponse = await fetch(
          `https://discord.com/api/v9/channels/${channel.id}/messages?limit=1`,
          { headers }
        );
        if (msgResponse.ok) {
          logger.info('This is a regular text channel with direct messages');
          logger.info('(Would need to paginate through all messages to count .dat files)');
        }
      } else if (channelInfo.type === 15) {
        // Forum channel - count threads
        let threadCount = 0;
        let hasMore = true;
        let before: string | undefined;

        while (hasMore) {
          const url = `https://discord.com/api/v9/channels/${channel.id}/threads/archived/public?limit=100${
            before ? `&before=${before}` : ''
          }`;
          const response = await fetch(url, { headers });

          if (response.ok) {
            const data = await response.json();
            threadCount += data.threads?.length || 0;
            hasMore = data.has_more;

            if (hasMore && data.threads?.length > 0) {
              const lastThread = data.threads[data.threads.length - 1];
              before = lastThread.thread_metadata.archive_timestamp.replace('+00:00', 'Z');
            }
          } else {
            break;
          }
        }

        logger.info(`Forum channel with ${threadCount} archived threads`);
        totalThreads += threadCount;
      }
    }
  }

  logger.info('\n=== SUMMARY ===');
  logger.info('Old channel: Text channel with individual messages containing .dat files');
  logger.info(`Community forum: ${totalThreads} threads`);
  logger.info('\nTo get exact counts, run the full indexer.');
}

countBothChannels().catch(console.error);
