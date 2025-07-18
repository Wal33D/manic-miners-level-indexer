import dotenv from 'dotenv';
import { DiscordAuth } from '../../src/auth/discordAuth';
import { logger } from '../../src/utils/logger';
import chalk from 'chalk';

dotenv.config();

async function testDiscordAuth() {
  logger.info(chalk.blue('🔐 Testing Discord Authentication...'));

  const auth = new DiscordAuth();

  try {
    // Test getting token
    logger.info('Attempting to get Discord token...');
    const result = await auth.getToken();

    if (result.token) {
      logger.success('✅ Successfully obtained Discord token!');
      logger.info(`Token starts with: ${result.token.substring(0, 20)}...`);

      if (result.username) {
        logger.info(`Authenticated as: ${result.username}`);
      }
      if (result.userId) {
        logger.info(`User ID: ${result.userId}`);
      }

      // Test the token by making an API request
      logger.info('\nTesting token with Discord API...');
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: {
          Authorization: result.token,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const user = await response.json();
        logger.success('✅ Token is valid!');
        logger.info(`Discord user: ${user.username}#${user.discriminator}`);
        logger.info(`Email: ${user.email || 'N/A'}`);
      } else {
        logger.error(`❌ Token validation failed: ${response.status} ${response.statusText}`);
      }
    } else {
      logger.error('❌ Failed to obtain Discord token');
    }
  } catch (error) {
    logger.error('❌ Authentication failed:', error);
  }
}

// Add option to clear cache
const args = process.argv.slice(2);
if (args.includes('--clear-cache')) {
  logger.info('Clearing auth cache...');
  const auth = new DiscordAuth();
  auth
    .clearCache()
    .then(() => {
      logger.success('Cache cleared!');
      return testDiscordAuth();
    })
    .catch(error => {
      logger.error('Failed to clear cache:', error);
    });
} else {
  testDiscordAuth().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}
