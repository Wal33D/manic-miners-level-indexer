import { DiscordAuth } from '../../src/auth/discordAuth';
import { logger } from '../../src/utils/logger';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function debugDiscordToken() {
  logger.info('=== Discord Token Debug ===\n');

  // Check environment
  logger.info('Environment Check:');
  logger.info(`DISCORD_TOKEN present: ${!!process.env.DISCORD_TOKEN}`);
  if (process.env.DISCORD_TOKEN) {
    logger.info(`Token starts with: ${process.env.DISCORD_TOKEN.substring(0, 30)}...`);
    logger.info(`Token length: ${process.env.DISCORD_TOKEN.length}`);
  }
  logger.info(`DISCORD_EMAIL present: ${!!process.env.DISCORD_EMAIL}`);
  logger.info(`DISCORD_PASSWORD present: ${!!process.env.DISCORD_PASSWORD}`);

  // Test token validation directly
  if (process.env.DISCORD_TOKEN) {
    logger.info('\nTesting token validation directly:');

    // Test basic validation
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: {
          Authorization: process.env.DISCORD_TOKEN,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      logger.info(`Basic validation response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const user = await response.json();
        logger.success(`✓ Basic validation passed - User: ${user.username}#${user.discriminator}`);
      } else {
        const text = await response.text();
        logger.error(`✗ Basic validation failed: ${text}`);
      }
    } catch (error) {
      logger.error('Basic validation error:', error);
    }

    // Test server access
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me/guilds', {
        headers: {
          Authorization: process.env.DISCORD_TOKEN,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      logger.info(`Server access response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const guilds = await response.json();
        logger.success(`✓ Server access passed - Found ${guilds.length} servers`);
      } else {
        const text = await response.text();
        logger.error(`✗ Server access failed: ${text}`);
      }
    } catch (error) {
      logger.error('Server access error:', error);
    }
  }

  // Now test through DiscordAuth
  logger.info('\nTesting through DiscordAuth class:');
  const auth = new DiscordAuth(path.join('./output', '.auth'));

  try {
    const result = await auth.getToken();
    logger.success('✓ DiscordAuth.getToken() succeeded');
    logger.info(`Token: ${result.token.substring(0, 30)}...`);
  } catch (error) {
    logger.error('✗ DiscordAuth.getToken() failed:', error);
  }
}

debugDiscordToken().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
