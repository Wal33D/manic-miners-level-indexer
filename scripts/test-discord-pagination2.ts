import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../src/utils/logger';

dotenv.config();

async function testPagination() {
  const token = process.env.DISCORD_USER_TOKEN;
  if (!token) {
    throw new Error('DISCORD_USER_TOKEN not found');
  }

  const channelId = '1139908458968252457';
  const headers = {
    Authorization: token,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  // First request
  logger.info('Making first request for archived threads...');
  const firstUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=2`;
  const firstResponse = await fetch(firstUrl, { headers });

  if (!firstResponse.ok) {
    logger.error(`First request failed: ${firstResponse.status}`);
    return;
  }

  const firstData = await firstResponse.json();
  logger.info(`First batch: ${firstData.threads.length} threads`);
  logger.info(`Has more? ${firstData.has_more}`);

  if (firstData.threads.length > 0) {
    const lastThread = firstData.threads[firstData.threads.length - 1];
    logger.info(`Last thread ID: ${lastThread.id}`);
    logger.info(`Last thread: "${lastThread.name}"`);
    logger.info(`Archive timestamp: ${lastThread.thread_metadata.archive_timestamp}`);

    // Try different pagination approaches
    logger.info('\n--- Testing pagination approaches ---');

    // 1. Using thread ID
    const withId = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=2&before=${lastThread.id}`;
    const idResponse = await fetch(withId, { headers });
    logger.info(`Using thread ID: ${idResponse.status}`);
    if (idResponse.ok) {
      const data = await idResponse.json();
      logger.info(`  Found ${data.threads?.length || 0} threads`);
      if (data.threads?.length > 0) {
        logger.info(`  First: "${data.threads[0].name}"`);
      }
    }

    // 2. Using encoded timestamp
    const encodedTime = encodeURIComponent(lastThread.thread_metadata.archive_timestamp);
    const withEncoded = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=2&before=${encodedTime}`;
    const encodedResponse = await fetch(withEncoded, { headers });
    logger.info(`Using encoded timestamp: ${encodedResponse.status}`);

    // 3. Using timestamp without timezone
    const cleanTime = lastThread.thread_metadata.archive_timestamp.replace('+00:00', 'Z');
    const withClean = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=2&before=${cleanTime}`;
    const cleanResponse = await fetch(withClean, { headers });
    logger.info(`Using clean timestamp: ${cleanResponse.status}`);

    // 4. Using Unix timestamp
    const unixTime = new Date(lastThread.thread_metadata.archive_timestamp).getTime();
    const withUnix = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=2&before=${unixTime}`;
    const unixResponse = await fetch(withUnix, { headers });
    logger.info(`Using unix timestamp: ${unixResponse.status}`);
  }
}

testPagination().catch(console.error);
