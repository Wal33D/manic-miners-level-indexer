import dotenv from 'dotenv';
import { Client } from 'discord.js-selfbot-v13';
import { logger } from '../../src/utils/logger';

dotenv.config();

async function testThreadFetching() {
  const client = new Client();

  client.once('ready', async () => {
    logger.success(`Logged in as ${client.user?.tag}`);

    try {
      const channelId = '1139908458968252457';
      const guildId = '580269696369164299';

      // Get the guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        logger.error('Guild not found');
        return;
      }

      logger.info(`Guild: ${guild.name}`);

      // Try to fetch all channels to populate cache
      logger.info('Fetching all guild channels...');
      try {
        // Use the channels cache directly
        const channels = guild.channels.cache;
        logger.info(`Cached channels: ${channels.size}`);

        // Look for threads in the cache
        let threadCount = 0;
        const threads: any[] = [];

        channels.forEach(channel => {
          // Check if it's a thread that belongs to our forum
          if ('parentId' in channel && channel.parentId === channelId) {
            threadCount++;
            threads.push({
              id: channel.id,
              name: (channel as any).name,
              type: channel.type,
              messageCount: (channel as any).messageCount,
            });
          }
        });

        logger.info(`Found ${threadCount} threads for forum ${channelId}`);

        if (threads.length > 0) {
          logger.info('First few threads:', threads.slice(0, 5));

          // Try to fetch messages from the first thread
          const firstThread = guild.channels.cache.get(threads[0].id);
          if (firstThread && 'messages' in firstThread) {
            logger.info(`Fetching messages from thread: ${threads[0].name}`);
            const messages = await (firstThread as any).messages.fetch({ limit: 10 });
            logger.info(`Fetched ${messages.size} messages`);

            // Look for .dat attachments
            let datCount = 0;
            messages.forEach((msg: any) => {
              msg.attachments.forEach((att: any) => {
                if (att.name?.toLowerCase().endsWith('.dat')) {
                  datCount++;
                  logger.info(`Found .dat file: ${att.name} by ${msg.author.username}`);
                }
              });
            });
            logger.info(`Total .dat files in sample: ${datCount}`);
          }
        }

        // Alternative: Try to search for threads manually
        logger.info('\nTrying alternative approach - checking all channel types...');
        const channelTypes: Record<string, number> = {};
        channels.forEach(ch => {
          const type = ch.type;
          channelTypes[type] = (channelTypes[type] || 0) + 1;
        });
        logger.info('Channel types in guild:', channelTypes);
      } catch (e) {
        logger.error('Error during channel operations:', e);
      }
    } catch (error) {
      logger.error('Test error:', error);
    } finally {
      client.destroy();
      process.exit(0);
    }
  });

  const token = process.env.DISCORD_USER_TOKEN;
  if (!token) {
    throw new Error('DISCORD_USER_TOKEN not found');
  }

  await client.login(token);
}

testThreadFetching().catch(console.error);
