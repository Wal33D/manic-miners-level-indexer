import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../src/utils/logger';

dotenv.config();

async function checkActiveThreads() {
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

  logger.info('Checking for active (unarchived) threads...\n');

  // Method 1: Search endpoint with archived=false
  try {
    const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=false&limit=100`;
    logger.info(`Trying search endpoint: ${searchUrl}`);
    const searchResponse = await fetch(searchUrl, { headers });

    logger.info(`Search response status: ${searchResponse.status}`);

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      logger.info(`Active threads found via search: ${searchData.threads?.length || 0}`);

      if (searchData.threads && searchData.threads.length > 0) {
        logger.info('\nActive thread names:');
        searchData.threads.forEach((thread: any, index: number) => {
          logger.info(`${index + 1}. ${thread.name}`);
        });
      }
    } else {
      const errorText = await searchResponse.text();
      logger.error(`Search failed: ${errorText}`);
    }
  } catch (error) {
    logger.error('Search endpoint error:', error);
  }

  // Method 2: Guild active threads
  try {
    const guildId = '580269696369164299';
    const guildUrl = `https://discord.com/api/v9/guilds/${guildId}/threads/active`;
    logger.info(`\nTrying guild active threads: ${guildUrl}`);
    const guildResponse = await fetch(guildUrl, { headers });

    logger.info(`Guild response status: ${guildResponse.status}`);

    if (guildResponse.ok) {
      const guildData = await guildResponse.json();
      const forumThreads = guildData.threads?.filter((t: any) => t.parent_id === channelId) || [];
      logger.info(`Active threads in our forum channel: ${forumThreads.length}`);

      if (forumThreads.length > 0) {
        logger.info('\nActive forum thread names:');
        forumThreads.forEach((thread: any, index: number) => {
          logger.info(`${index + 1}. ${thread.name}`);
        });
      }
    }
  } catch (error) {
    logger.error('Guild endpoint error:', error);
  }

  // Method 3: Check total count
  logger.info('\n--- Summary ---');
  logger.info('The 125 count includes only ARCHIVED threads.');
  logger.info('Active threads (if any) would be additional to this count.');
}

checkActiveThreads().catch(console.error);
