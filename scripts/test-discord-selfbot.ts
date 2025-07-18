import dotenv from 'dotenv';
import { Client } from 'discord.js-selfbot-v13';
import { logger } from '../src/utils/logger';

dotenv.config();

async function testDiscordSelfBot() {
  const client = new Client();

  client.once('ready', async () => {
    logger.success(`Logged in as ${client.user?.tag}`);

    try {
      const channelId = '1139908458968252457';
      const channel = await client.channels.fetch(channelId);

      logger.info(`Channel type: ${channel?.type}`);
      logger.info(`Channel name: ${(channel as any)?.name}`);

      if (channel?.type === 'GUILD_FORUM') {
        logger.info('This is a forum channel');

        // Try to access threads directly
        const forumChannel = channel as any;

        // Log available properties
        logger.info(
          'Channel properties:',
          Object.keys(forumChannel).filter(k => !k.startsWith('_'))
        );

        // Try to fetch threads using raw API
        try {
          const response = await (client as any).api.channels(channelId).threads.archived.get({
            query: { limit: 100 },
          });
          logger.info(`Raw API response:`, response);
        } catch (e) {
          logger.error('Raw API error:', e);
        }

        // Try alternative approaches
        if (forumChannel.threads) {
          logger.info('Threads manager available');
          try {
            // Get the cache
            logger.info(`Cached threads: ${forumChannel.threads.cache.size}`);

            // Try fetching
            const active = await forumChannel.threads.fetch();
            logger.info(`Fetched threads:`, active);
          } catch (e) {
            logger.error('Thread fetch error:', e);
          }
        }

        // Check guild access
        const guildId = forumChannel.guildId;
        if (guildId) {
          const guild = client.guilds.cache.get(guildId);
          logger.info(`Guild: ${guild?.name}`);

          // Try to get threads from guild
          try {
            const channels = guild?.channels.cache;
            let threadCount = 0;
            channels?.forEach(ch => {
              if ('parentId' in ch && ch.parentId === channelId) {
                threadCount++;
                logger.info(`Found thread: ${(ch as any).name}`);
              }
            });
            logger.info(`Total threads found in cache: ${threadCount}`);
          } catch (e) {
            logger.error('Guild channel error:', e);
          }
        }
      }
    } catch (error) {
      logger.error('Test error:', error);
    }

    client.destroy();
    process.exit(0);
  });

  const token = process.env.DISCORD_USER_TOKEN;
  if (!token) {
    throw new Error('DISCORD_USER_TOKEN not found');
  }

  await client.login(token);
}

testDiscordSelfBot().catch(console.error);
