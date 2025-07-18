import { chromium, Browser, Page } from 'playwright';
import { logger } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

interface AuthResult {
  token: string;
  userId?: string;
  username?: string;
  expiresAt?: Date;
}

interface CachedToken {
  token: string;
  userId?: string;
  username?: string;
  savedAt: string;
  expiresAt?: string;
}

export class DiscordAuth {
  private cacheDir: string;
  private cacheFile: string;
  private browser?: Browser;
  private page?: Page;

  constructor(cacheDir: string = './data/.auth') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'discord-token.json');
  }

  async getToken(): Promise<AuthResult> {
    // Try to get cached token first
    const cached = await this.getCachedToken();
    if (cached && this.isTokenValid(cached)) {
      logger.info('Using cached Discord token');
      return {
        token: cached.token,
        userId: cached.userId,
        username: cached.username,
        expiresAt: cached.expiresAt ? new Date(cached.expiresAt) : undefined,
      };
    }

    // Try environment variable
    const envToken = process.env.DISCORD_USER_TOKEN;
    if (envToken) {
      logger.info('Using Discord token from environment variable');
      const result = { token: envToken };
      await this.cacheToken(result);
      return result;
    }

    // If no cached token or env token, use Playwright to get one
    logger.info('No valid token found, initiating Discord login with Playwright...');
    return await this.authenticateWithPlaywright();
  }

  private async getCachedToken(): Promise<CachedToken | null> {
    try {
      if (await fs.pathExists(this.cacheFile)) {
        const content = await fs.readFile(this.cacheFile, 'utf-8');
        const cached = JSON.parse(content) as CachedToken;
        return cached;
      }
    } catch (error) {
      logger.warn('Failed to read cached token:', error);
    }
    return null;
  }

  private isTokenValid(cached: CachedToken): boolean {
    // Check if token exists
    if (!cached.token) return false;

    // Check expiration if set
    if (cached.expiresAt) {
      const expiresAt = new Date(cached.expiresAt);
      if (expiresAt < new Date()) {
        logger.info('Cached token has expired');
        return false;
      }
    }

    // Token is older than 30 days, consider it expired
    const savedAt = new Date(cached.savedAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (savedAt < thirtyDaysAgo) {
      logger.info('Cached token is older than 30 days');
      return false;
    }

    return true;
  }

  private async cacheToken(result: AuthResult): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir);
      const cached: CachedToken = {
        token: result.token,
        userId: result.userId,
        username: result.username,
        savedAt: new Date().toISOString(),
        expiresAt: result.expiresAt?.toISOString(),
      };
      await fs.writeFile(this.cacheFile, JSON.stringify(cached, null, 2));
      logger.info('Discord token cached successfully');
    } catch (error) {
      logger.warn('Failed to cache token:', error);
    }
  }

  private async authenticateWithPlaywright(): Promise<AuthResult> {
    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: false, // Show browser for user interaction
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      this.page = await this.browser.newPage();

      // Set up request interception to capture the token
      let capturedToken: string | null = null;
      let userId: string | null = null;
      let username: string | null = null;

      // Intercept all requests to Discord API endpoints
      this.page.on('request', request => {
        const url = request.url();
        const headers = request.headers();

        // Check if this is a Discord API request
        if (url.includes('discord.com/api/v') || url.includes('discordapp.com/api/v')) {
          // Check for authorization header
          if (headers.authorization && !headers.authorization.startsWith('Bot ')) {
            capturedToken = headers.authorization;
            logger.info(`Captured Discord token from API request to: ${url}`);

            // Try to extract user info from the URL if it's a user-specific endpoint
            const userMatch = url.match(/users\/(\d+)/);
            if (userMatch && userMatch[1] !== '@me') {
              userId = userMatch[1];
            }
          }
        }
      });

      // Also intercept responses to get user info
      this.page.on('response', async response => {
        const url = response.url();

        // Check if this is the @me endpoint which contains user info
        if (url.includes('/api/v') && url.includes('/users/@me') && response.status() === 200) {
          try {
            const data = await response.json();
            if (data.id) {
              userId = data.id;
              username = data.username;
              logger.info(`Captured user info: ${username} (${userId})`);
            }
          } catch (error) {
            // Ignore JSON parsing errors
          }
        }
      });

      // Navigate to Discord login
      logger.info('Navigating to Discord login page...');
      await this.page.goto('https://discord.com/login', { waitUntil: 'networkidle' });

      // Check if already logged in
      const isLoggedIn = await this.page
        .waitForSelector('[data-list-id="guildsnav"]', { timeout: 5000 })
        .catch(() => null);

      if (isLoggedIn) {
        logger.info('Already logged in to Discord');

        // Force some API requests to capture the token
        await this.page.evaluate(() => {
          fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {}); // Ignore errors
        });

        await this.page.waitForTimeout(2000);
      } else {
        // Check for saved credentials
        const email = process.env.DISCORD_EMAIL;
        const password = process.env.DISCORD_PASSWORD;

        if (email && password) {
          logger.info('Attempting automatic login with saved credentials...');

          // Fill in login form
          await this.page.fill('input[name="email"]', email);
          await this.page.waitForTimeout(500);
          await this.page.fill('input[name="password"]', password);
          await this.page.waitForTimeout(500);
          await this.page.click('button[type="submit"]');

          logger.info('Login submitted, waiting for Discord to load...');
        } else {
          logger.info('Please log in to Discord manually in the browser window');
          logger.info('The script will continue automatically once you are logged in');
        }

        // Wait for successful login
        await this.page.waitForSelector('[data-list-id="guildsnav"]', {
          timeout: 300000, // 5 minutes
        });

        logger.success('Successfully logged in to Discord');

        // Wait for page to stabilize and make some API calls
        await this.page.waitForTimeout(3000);

        // Force a request to the @me endpoint to capture token and user info
        await this.page.evaluate(() => {
          fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {}); // Ignore errors
        });

        await this.page.waitForTimeout(2000);
      }

      // If we still don't have a token, navigate to a channel to trigger API requests
      if (!capturedToken) {
        logger.info('Token not captured yet, navigating to trigger API requests...');

        // Navigate to Discord app to trigger API calls
        await this.page.goto('https://discord.com/channels/@me', { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);

        // Try clicking around to trigger API requests
        try {
          // Click on the user area to trigger user info requests
          const userArea = await this.page.$('[class*="panels-"] [class*="container-"]');
          if (userArea) {
            await userArea.click();
            await this.page.waitForTimeout(1000);
          }
        } catch (error) {
          // Ignore errors here
        }
      }

      if (!capturedToken) {
        throw new Error(
          'Failed to capture Discord token. Please try logging in again and ensure you navigate to a channel or server.'
        );
      }

      const result: AuthResult = {
        token: capturedToken,
        userId: userId || undefined,
        username: username || undefined,
      };

      // Cache the token
      await this.cacheToken(result);

      logger.success(
        `Discord authentication successful! Token captured for user: ${username || userId || 'unknown'}`
      );

      return result;
    } catch (error) {
      logger.error('Discord authentication failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
        this.page = undefined;
      }
    } catch (error) {
      logger.warn('Failed to cleanup browser:', error);
    }
  }

  async clearCache(): Promise<void> {
    try {
      if (await fs.pathExists(this.cacheFile)) {
        await fs.remove(this.cacheFile);
        logger.info('Discord token cache cleared');
      }
    } catch (error) {
      logger.warn('Failed to clear token cache:', error);
    }
  }
}
