import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../src/utils/logger';

dotenv.config();

async function findRageRoad() {
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

  logger.info('Searching for Rage Road thread...\n');

  // Try searching with query
  try {
    const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=true&query=rage%20road&limit=25`;
    const response = await fetch(searchUrl, { headers });

    logger.info(`Search with query status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      logger.info(`Found ${data.threads?.length || 0} threads matching "rage road"`);

      if (data.threads) {
        data.threads.forEach((thread: any) => {
          logger.info(`- ${thread.name} (ID: ${thread.id})`);
        });
      }
    } else {
      const error = await response.text();
      logger.error(`Search failed: ${error}`);
    }
  } catch (error) {
    logger.error('Search error:', error);
  }

  // Let's also check how old our oldest thread is
  logger.info('\n--- Checking age of threads ---');

  let oldestDate: Date | null = null;
  let oldestName = '';
  let hasMore = true;
  let before: string | undefined;
  let totalChecked = 0;

  while (hasMore && totalChecked < 200) {
    const url = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=100${
      before ? `&before=${before}` : ''
    }`;

    const response = await fetch(url, { headers });

    if (response.ok) {
      const data = await response.json();
      const threads = data.threads || [];

      if (threads.length > 0) {
        const lastThread = threads[threads.length - 1];
        const archiveDate = new Date(lastThread.thread_metadata.archive_timestamp);

        if (!oldestDate || archiveDate < oldestDate) {
          oldestDate = archiveDate;
          oldestName = lastThread.name;
        }

        // Check if Rage Road is in this batch
        const rageRoad = threads.find((t: any) => t.name.toLowerCase().includes('rage road'));
        if (rageRoad) {
          logger.info(`\nFOUND RAGE ROAD in batch!`);
          logger.info(`Name: ${rageRoad.name}`);
          logger.info(`ID: ${rageRoad.id}`);
          logger.info(`Archived: ${rageRoad.thread_metadata.archive_timestamp}`);
          break;
        }

        totalChecked += threads.length;
        hasMore = data.has_more;

        if (hasMore) {
          before = lastThread.thread_metadata.archive_timestamp.replace('+00:00', 'Z');
        }
      } else {
        hasMore = false;
      }
    } else {
      logger.error(`Failed to fetch threads: ${response.status}`);
      break;
    }
  }

  logger.info(`\nTotal threads checked: ${totalChecked}`);
  if (oldestDate) {
    logger.info(`Oldest thread found: "${oldestName}" from ${oldestDate.toISOString()}`);
  }
}

findRageRoad().catch(console.error);
