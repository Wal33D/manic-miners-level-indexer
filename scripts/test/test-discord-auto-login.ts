import { DiscordAuth } from '../../src/auth/discordAuth';
import { logger } from '../../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function testAutoLogin() {
  logger.info('=== Testing Discord Automatic Login ===\n');

  // Clear any existing token from environment to force login
  const originalToken = process.env.DISCORD_USER_TOKEN;
  delete process.env.DISCORD_USER_TOKEN;
  delete process.env.DISCORD_TOKEN;

  const auth = new DiscordAuth('./test-data/.auth');

  try {
    // Clear cache to force fresh login
    logger.info('Step 1: Clearing authentication cache...');
    await auth.clearCache();
    logger.success('Cache cleared\n');

    // Check credentials
    logger.info('Step 2: Checking login credentials...');
    const email = process.env.DISCORD_EMAIL;
    const password = process.env.DISCORD_PASSWORD;

    if (!email || !password) {
      logger.error('DISCORD_EMAIL and DISCORD_PASSWORD must be set in environment');
      return;
    }

    logger.info(`Email: ${email.substring(0, 3)}...${email.substring(email.indexOf('@'))}`);
    logger.info('Password: ***\n');

    // Test automatic login
    logger.info('Step 3: Testing automatic headless login...');
    logger.info('This will attempt to login without opening a visible browser');
    logger.info('If CAPTCHA is detected, it will fall back to visible browser\n');

    const startTime = Date.now();
    const result = await auth.getToken();
    const duration = Date.now() - startTime;

    logger.success(`\nAuthentication completed in ${(duration / 1000).toFixed(1)} seconds!`);
    logger.info(`Token: ${result.token.substring(0, 20)}...`);
    logger.info(`User ID: ${result.userId || 'Unknown'}`);
    logger.info(`Username: ${result.username || 'Unknown'}\n`);

    // Test that session was saved
    logger.info('Step 4: Testing session persistence...');

    // Clear token cache but not session
    await auth.clearCache();

    // Try again - should use saved session
    const sessionStart = Date.now();
    const sessionResult = await auth.getToken();
    const sessionDuration = Date.now() - sessionStart;

    if (sessionDuration < 5000) {
      logger.success(
        `Session restored successfully in ${(sessionDuration / 1000).toFixed(1)} seconds!`
      );
    } else {
      logger.warn('Session restoration might have failed (took too long)');
    }

    // Validate the token
    logger.info('\nStep 5: Validating token with Discord API...');
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
      logger.info(`Verified: ${user.verified}`);
      logger.info(`MFA Enabled: ${user.mfa_enabled}`);
    } else {
      logger.error(`Token validation failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error('Automatic login test failed:', error);

    if (error instanceof Error && error.message?.includes('CAPTCHA')) {
      logger.warn('\n⚠️  CAPTCHA detected!');
      logger.info('Discord requires CAPTCHA verification for this login');
      logger.info('The system will automatically open a visible browser for manual completion');
    } else if (error instanceof Error && error.message?.includes('credentials')) {
      logger.error('\n❌ Invalid credentials');
      logger.info('Please check your DISCORD_EMAIL and DISCORD_PASSWORD environment variables');
    }
  } finally {
    // Restore original token if it existed
    if (originalToken) {
      process.env.DISCORD_USER_TOKEN = originalToken;
    }
  }

  logger.info('\n=== Test Complete ===');
}

// Run the test
testAutoLogin().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
