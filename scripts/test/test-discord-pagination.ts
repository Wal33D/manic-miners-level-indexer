import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../../src/utils/logger';

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
  const firstUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100`;
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
    logger.info(`Last thread in first batch: "${lastThread.name}"`);
    logger.info(`Archive timestamp: ${lastThread.thread_metadata.archive_timestamp}`);

    if (firstData.has_more) {
      // Try pagination with the archive timestamp
      const before = lastThread.thread_metadata.archive_timestamp;
      logger.info(`\nAttempting pagination with before=${before}`);

      const secondUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100&before=${before}`;
      logger.info(`Second URL: ${secondUrl}`);

      const secondResponse = await fetch(secondUrl, { headers });

      if (!secondResponse.ok) {
        logger.error(`Second request failed: ${secondResponse.status}`);
        const errorText = await secondResponse.text();
        logger.error(`Error response: ${errorText}`);
        return;
      }

      const secondData = await secondResponse.json();
      logger.info(`Second batch: ${secondData.threads?.length || 0} threads`);
      logger.info(`Has more? ${secondData.has_more}`);

      if (secondData.threads && secondData.threads.length > 0) {
        logger.info(`First thread in second batch: "${secondData.threads[0].name}"`);
        logger.info(
          `Last thread in second batch: "${secondData.threads[secondData.threads.length - 1].name}"`
        );
      }
    }
  }

  // Also check the total using different approach
  logger.info('\n--- Testing with different parameters ---');

  // Try with offset
  const offsetUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100&offset=100`;
  const offsetResponse = await fetch(offsetUrl, { headers });
  logger.info(`Offset approach (offset=100): ${offsetResponse.status}`);

  // Try search endpoint for total count
  const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=true&limit=100`;
  const searchResponse = await fetch(searchUrl, { headers });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    logger.info(`\nSearch endpoint found: ${searchData.threads?.length || 0} threads`);
    logger.info(`Total threads reported: ${searchData.total_results || 'not provided'}`);
    logger.info(`Has more: ${searchData.has_more}`);
  } else {
    logger.error(`Search endpoint failed: ${searchResponse.status}`);
  }
}

testPagination().catch(console.error);
