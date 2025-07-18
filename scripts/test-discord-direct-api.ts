import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { logger } from '../src/utils/logger';

dotenv.config();

async function testDirectAPI() {
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

  try {
    // Try to fetch active threads
    logger.info('Fetching active threads...');
    const activeUrl = `https://discord.com/api/v9/guilds/580269696369164299/threads/active`;
    const activeResponse = await fetch(activeUrl, { headers });

    if (activeResponse.ok) {
      const activeData = await activeResponse.json();
      logger.info(`Active threads response:`, activeData);

      // Filter threads for our forum channel
      const forumThreads =
        activeData.threads?.filter((thread: any) => thread.parent_id === channelId) || [];
      logger.info(`Found ${forumThreads.length} active threads in forum`);
    } else {
      logger.error(`Failed to fetch active threads: ${activeResponse.status}`);
    }

    // Try to fetch archived threads
    logger.info('\nFetching archived threads...');
    const archivedUrl = `https://discord.com/api/v9/channels/${channelId}/threads/archived/public`;
    const archivedResponse = await fetch(archivedUrl, { headers });

    if (archivedResponse.ok) {
      const archivedData = await archivedResponse.json();
      logger.info(`Archived threads:`, archivedData);
    } else {
      logger.error(`Failed to fetch archived threads: ${archivedResponse.status}`);
    }

    // Try forum-specific endpoint
    logger.info('\nTrying forum search endpoint...');
    const searchUrl = `https://discord.com/api/v9/channels/${channelId}/threads/search?archived=true&limit=100`;
    const searchResponse = await fetch(searchUrl, { headers });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      logger.info(`Forum search results:`, searchData);

      if (searchData.threads && searchData.threads.length > 0) {
        logger.info(`\nFound ${searchData.threads.length} total threads`);

        // Show first few thread names
        const threadNames = searchData.threads.slice(0, 5).map((t: any) => t.name);
        logger.info('First 5 threads:', threadNames);

        // Try to fetch messages from first thread
        const firstThreadId = searchData.threads[0].id;
        logger.info(`\nFetching messages from first thread (${searchData.threads[0].name})...`);

        const messagesUrl = `https://discord.com/api/v9/channels/${firstThreadId}/messages?limit=50`;
        const messagesResponse = await fetch(messagesUrl, { headers });

        if (messagesResponse.ok) {
          const messages = await messagesResponse.json();
          logger.info(`Fetched ${messages.length} messages`);

          // Look for .dat attachments
          let datFiles = 0;
          messages.forEach((msg: any) => {
            msg.attachments?.forEach((att: any) => {
              if (att.filename?.toLowerCase().endsWith('.dat')) {
                datFiles++;
                logger.info(`Found .dat: ${att.filename} by ${msg.author.username}`);
              }
            });
          });

          logger.info(`Total .dat files found: ${datFiles}`);
        }
      }
    } else {
      logger.error(`Failed to search forum: ${searchResponse.status}`);
      const errorText = await searchResponse.text();
      logger.error('Error response:', errorText);
    }
  } catch (error) {
    logger.error('API test error:', error);
  }
}

testDirectAPI().catch(console.error);
