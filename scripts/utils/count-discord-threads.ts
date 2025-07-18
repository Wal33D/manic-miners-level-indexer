import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../../src/utils/logger';

dotenv.config();

async function countAllThreads() {
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

  const allThreads: any[] = [];
  let hasMore = true;
  let before: string | undefined;

  // Fetch all archived threads with pagination
  while (hasMore) {
    const url = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100${
      before ? `&before=${before}` : ''
    }`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      logger.error(`Failed to fetch archived threads: ${response.status}`);
      break;
    }

    const data = await response.json();
    const threads = data.threads || [];

    allThreads.push(...threads);
    hasMore = data.has_more;

    if (hasMore && threads.length > 0) {
      // Get the last thread's archive timestamp for pagination
      const lastThread = threads[threads.length - 1];
      before = lastThread.thread_metadata.archive_timestamp;
    }

    logger.info(`Fetched ${threads.length} threads, total so far: ${allThreads.length}`);
  }

  logger.info(`\nTotal archived threads found: ${allThreads.length}`);

  // Also try to get active threads
  try {
    const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=false&limit=100`;
    const searchResponse = await fetch(searchUrl, { headers });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const activeThreads = searchData.threads || [];
      logger.info(`Active threads found: ${activeThreads.length}`);
      allThreads.push(...activeThreads);
    }
  } catch (error) {
    logger.warn('Could not fetch active threads');
  }

  logger.info(`\n📊 FINAL COUNT: ${allThreads.length} total threads`);

  // Show thread names
  logger.info('\nAll thread names:');
  allThreads.forEach((thread, index) => {
    logger.info(`${index + 1}. ${thread.name}`);
  });

  // Count threads with .dat files
  let threadsWithDatFiles = 0;
  let totalDatFiles = 0;

  for (const thread of allThreads) {
    const messagesUrl = `https://discord.com/api/v9/channels/${thread.id}/messages?limit=100`;
    const msgResponse = await fetch(messagesUrl, { headers });

    if (msgResponse.ok) {
      const messages = await msgResponse.json();
      let threadHasDat = false;

      for (const msg of messages) {
        const datCount =
          msg.attachments?.filter((att: any) => att.filename?.toLowerCase().endsWith('.dat'))
            .length || 0;

        if (datCount > 0) {
          threadHasDat = true;
          totalDatFiles += datCount;
        }
      }

      if (threadHasDat) {
        threadsWithDatFiles++;
      }
    }
  }

  logger.info(`\n📁 Threads containing .dat files: ${threadsWithDatFiles}`);
  logger.info(`📄 Total .dat files found: ${totalDatFiles}`);
}

countAllThreads().catch(console.error);
