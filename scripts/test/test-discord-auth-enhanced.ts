import { DiscordAuth } from '../../src/auth/discordAuth';
import { logger } from '../../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function testEnhancedAuth() {
  logger.info('=== Testing Enhanced Discord Authentication ===\n');

  const auth = new DiscordAuth('./test-data/.auth');

  try {
    // Test 1: Clear any existing cache
    logger.info('Test 1: Clearing existing auth cache...');
    await auth.clearCache();
    logger.success('Cache cleared\n');

    // Test 2: Try to authenticate (will use env vars if available)
    logger.info('Test 2: Testing automatic authentication...');
    logger.info('Environment variables detected:');
    logger.info(`- DISCORD_EMAIL: ${process.env.DISCORD_EMAIL ? '✓ Set' : '✗ Not set'}`);
    logger.info(`- DISCORD_PASSWORD: ${process.env.DISCORD_PASSWORD ? '✓ Set' : '✗ Not set'}`);
    logger.info(`- DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '✓ Set' : '✗ Not set'}`);
    logger.info(
      `- DISCORD_USER_TOKEN: ${process.env.DISCORD_USER_TOKEN ? '✓ Set' : '✗ Not set'}\n`
    );

    const result = await auth.getToken();

    logger.success('Authentication successful!');
    logger.info(`Token: ${result.token.substring(0, 20)}...`);
    logger.info(`User ID: ${result.userId || 'Unknown'}`);
    logger.info(`Username: ${result.username || 'Unknown'}\n`);

    // Test 3: Try to use cached token
    logger.info('Test 3: Testing cached token...');
    const cachedResult = await auth.getToken();

    if (cachedResult.token === result.token) {
      logger.success('Cached token working correctly!\n');
    } else {
      logger.warn('Cached token differs from original\n');
    }

    // Test 4: Validate the token
    logger.info('Test 4: Validating token with Discord API...');
    const response = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        Authorization: result.token,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (response.ok) {
      const user = await response.json();
      logger.success('Token validated successfully!');
      logger.info(`Discord User: ${user.username}#${user.discriminator}`);
      logger.info(`User ID: ${user.id}`);
      logger.info(`Email: ${user.email || 'Not available'}`);
    } else {
      logger.error(`Token validation failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error('Authentication test failed:', error);
  }
}

// Run the test
testEnhancedAuth().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
