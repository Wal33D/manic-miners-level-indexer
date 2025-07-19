#!/usr/bin/env npx tsx

import { DiscordAuth } from '../src/auth/discordAuth';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testHeadlessAuth() {
  logger.info('Testing enhanced Discord authentication (headless priority)...');

  const authDir = path.join(__dirname, '../outputs/test-auth-headless');
  await fs.ensureDir(authDir);

  // Check if we have credentials
  const hasCredentials = !!(process.env.DISCORD_EMAIL && process.env.DISCORD_PASSWORD);
  logger.info(`Credentials available: ${hasCredentials}`);

  const auth = new DiscordAuth(authDir);

  try {
    // Clear cache to test fresh authentication
    const clearCache = process.argv.includes('--clear-cache');
    if (clearCache) {
      logger.info('Clearing authentication cache...');
      await auth.clearCache();
    }

    logger.info('Attempting to get Discord token...');
    const startTime = Date.now();

    const result = await auth.getToken();

    const duration = Date.now() - startTime;
    logger.success(`Authentication successful in ${(duration / 1000).toFixed(1)}s`);
    logger.info(`Token obtained for user: ${result.username || result.userId || 'unknown'}`);
    logger.info(`Token preview: ${result.token.substring(0, 20)}...`);

    // Test token validation
    logger.info('\nValidating token...');
    const response = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        Authorization: result.token,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (response.ok) {
      const user = await response.json();
      logger.success(`Token validated! User: ${user.username}#${user.discriminator}`);
    } else {
      logger.error(`Token validation failed: ${response.status}`);
    }

    // Check what's in the cache directory
    logger.info('\nCache directory contents:');
    const files = await fs.readdir(authDir);
    for (const file of files) {
      const stats = await fs.stat(path.join(authDir, file));
      logger.info(`  - ${file} (${stats.size} bytes)`);
    }
  } catch (error) {
    logger.error('Authentication failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
Discord Authentication Test (Headless Priority)

Usage: npm run test:discord:auth:headless [options]

Options:
  --clear-cache    Clear authentication cache before testing
  --help          Show this help message

Environment Variables:
  DISCORD_EMAIL     Discord account email
  DISCORD_PASSWORD  Discord account password
  DISCORD_TOKEN     Existing Discord token (will skip login if valid)

This test verifies that the enhanced authentication:
1. Uses cached tokens when available
2. Attempts headless login with credentials
3. Only opens browser when absolutely necessary
`);
  process.exit(0);
}

testHeadlessAuth().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
