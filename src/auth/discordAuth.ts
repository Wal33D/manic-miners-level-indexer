import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { DiscordTokenProvider } from './discordTokenProvider';

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
  sessionData?: string; // Encrypted session data
}

interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage: Record<string, string>;
}

export class DiscordAuth {
  private cacheDir: string;
  private cacheFile: string;
  private sessionFile: string;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private maxRetries = 3;
  private retryDelay = 2000;

  constructor(cacheDir: string = './data/.auth') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'discord-token.json');
    this.sessionFile = path.join(cacheDir, 'discord-session.json');
  }

  async getToken(options?: { token?: string; tokenFile?: string }): Promise<AuthResult> {
    // Try to get cached token first
    const cached = await this.getCachedToken();
    if (cached && (await this.isTokenValid(cached))) {
      logger.info('Using cached Discord token');
      return {
        token: cached.token,
        userId: cached.userId,
        username: cached.username,
        expiresAt: cached.expiresAt ? new Date(cached.expiresAt) : undefined,
      };
    }

    // Try to get token from various sources
    const providedToken = await DiscordTokenProvider.getToken(options);
    if (providedToken) {
      // Validate the token
      if (await DiscordTokenProvider.validateToken(providedToken)) {
        const result = { token: providedToken };
        await this.cacheToken(result);
        return result;
      } else {
        logger.warn('Provided token is invalid, proceeding with authentication');
      }
    }

    // Check if we have credentials for automatic login
    const email = process.env.DISCORD_EMAIL;
    const password = process.env.DISCORD_PASSWORD;

    if (email && password) {
      logger.info('Attempting automatic Discord login...');
      // Try headless authentication first
      try {
        const result = await this.authenticateWithPlaywright(true, email, password);
        if (result) {
          return result;
        }
      } catch (error) {
        logger.warn('Headless authentication failed, will try with visible browser', error);
      }
    }

    // Fall back to manual login with visible browser
    logger.info('Starting manual Discord login with visible browser...');
    return await this.authenticateWithPlaywright(false);
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

  private async isTokenValid(cached: CachedToken): Promise<boolean> {
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

    // Validate the token with Discord API
    const isValid = await this.validateToken(cached.token);
    if (!isValid) {
      logger.info('Cached token failed validation');
      return false;
    }

    return true;
  }

  private async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: {
          Authorization: token,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
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

  private async saveSession(context: BrowserContext): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir);

      // Get cookies
      const cookies = await context.cookies();

      // Get localStorage data
      const localStorage =
        (await this.page?.evaluate(() => {
          const data: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              data[key] = window.localStorage.getItem(key) || '';
            }
          }
          return data;
        })) || {};

      const sessionData: SessionData = {
        cookies,
        localStorage,
      };

      // Encrypt session data
      const encryptedData = this.encryptData(JSON.stringify(sessionData));

      await fs.writeFile(this.sessionFile, encryptedData);
      logger.info('Discord session saved successfully');
    } catch (error) {
      logger.warn('Failed to save session:', error);
    }
  }

  private async loadSession(context: BrowserContext): Promise<boolean> {
    try {
      if (!(await fs.pathExists(this.sessionFile))) {
        return false;
      }

      const encryptedData = await fs.readFile(this.sessionFile, 'utf-8');
      const sessionData: SessionData = JSON.parse(this.decryptData(encryptedData));

      // Restore cookies
      await context.addCookies(sessionData.cookies);

      // Navigate to Discord first
      await this.page?.goto('https://discord.com/login', { waitUntil: 'domcontentloaded' });

      // Restore localStorage
      await this.page?.evaluate(data => {
        Object.entries(data).forEach(([key, value]) => {
          window.localStorage.setItem(key, value);
        });
      }, sessionData.localStorage);

      logger.info('Discord session restored successfully');
      return true;
    } catch (error) {
      logger.warn('Failed to load session:', error);
      return false;
    }
  }

  private encryptData(data: string): string {
    // Use environment key or default, create proper key and IV
    const password = process.env.DISCORD_SESSION_KEY || 'default-encryption-key-change-me';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV to encrypted data
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptData(encrypted: string): string {
    const password = process.env.DISCORD_SESSION_KEY || 'default-encryption-key-change-me';
    const key = crypto.scryptSync(password, 'salt', 32);

    // Extract IV from encrypted data
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async authenticateWithPlaywright(
    headless: boolean,
    email?: string,
    password?: string
  ): Promise<AuthResult> {
    let retries = 0;
    let capturedToken: string | null = null;

    while (retries < this.maxRetries) {
      try {
        // Launch browser with stealth options
        this.browser = await chromium.launch({
          headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
        });

        // Create context with user agent and viewport
        this.context = await this.browser.newContext({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 720 },
          locale: 'en-US',
        });

        this.page = await this.context.newPage();

        // Try to load existing session
        const sessionLoaded = await this.loadSession(this.context);

        // Set up request interception to capture the token
        capturedToken = null; // Reset for this attempt
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

        // Navigate to Discord
        logger.info('Navigating to Discord...');
        await this.page.goto('https://discord.com/login', { waitUntil: 'networkidle' });

        // Check if already logged in (from session or cookies)
        const isLoggedIn = await this.page
          .waitForSelector('[data-list-id="guildsnav"]', { timeout: 5000 })
          .catch(() => null);

        if (isLoggedIn) {
          logger.info('Already logged in to Discord (session restored)');

          // Force some API requests to capture the token
          await this.page.evaluate(() => {
            fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
          });

          await this.page.waitForTimeout(2000);
        } else if (headless && email && password) {
          logger.info('Attempting automatic login...');

          // Wait for login form to be ready
          await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });

          // Add delays to mimic human behavior
          await this.page.waitForTimeout(1000);

          // Fill in login form
          await this.page.fill('input[name="email"]', email, { timeout: 5000 });
          await this.page.waitForTimeout(500 + Math.random() * 1000);

          await this.page.fill('input[name="password"]', password, { timeout: 5000 });
          await this.page.waitForTimeout(500 + Math.random() * 1000);

          // Click login button
          await this.page.click('button[type="submit"]', { timeout: 5000 });

          logger.info('Login submitted, waiting for Discord to load...');

          // Wait for successful login or captcha
          const loginResult = await Promise.race([
            this.page
              .waitForSelector('[data-list-id="guildsnav"]', { timeout: 30000 })
              .then(() => 'success'),
            this.page
              .waitForSelector('iframe[src*="recaptcha"]', { timeout: 30000 })
              .then(() => 'captcha'),
            this.page
              .waitForSelector('[class*="errorMessage"]', { timeout: 30000 })
              .then(() => 'error'),
          ]);

          if (loginResult === 'captcha') {
            logger.warn('CAPTCHA detected, automatic login not possible');
            if (headless) {
              throw new Error('CAPTCHA requires manual intervention');
            }
          } else if (loginResult === 'error') {
            logger.error('Login error detected');
            throw new Error('Login failed - check credentials');
          } else if (loginResult === 'success') {
            logger.success('Successfully logged in to Discord automatically');

            // Save session for future use
            await this.saveSession(this.context);
          }

          // Wait for page to stabilize
          await this.page.waitForTimeout(3000);

          // Force a request to the @me endpoint
          await this.page.evaluate(() => {
            fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
          });

          await this.page.waitForTimeout(2000);
        } else {
          // Manual login mode
          logger.info('Please log in to Discord manually in the browser window');
          logger.info('The script will continue automatically once you are logged in');

          // Wait for successful login
          await this.page.waitForSelector('[data-list-id="guildsnav"]', {
            timeout: 300000, // 5 minutes
          });

          logger.success('Successfully logged in to Discord');

          // Save session for future use
          await this.saveSession(this.context);

          // Wait for page to stabilize
          await this.page.waitForTimeout(3000);

          // Force a request to the @me endpoint
          await this.page.evaluate(() => {
            fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
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
        retries++;
        logger.error(`Authentication attempt ${retries} failed:`, error);

        if (retries < this.maxRetries) {
          logger.info(`Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));

          // Clean up before retry
          await this.cleanup();
        } else {
          throw error;
        }
      } finally {
        if (retries >= this.maxRetries || capturedToken) {
          await this.cleanup();
        }
      }
    }

    throw new Error('Max retries exceeded for Discord authentication');
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
        this.context = undefined;
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
      if (await fs.pathExists(this.sessionFile)) {
        await fs.remove(this.sessionFile);
        logger.info('Discord session cleared');
      }
    } catch (error) {
      logger.warn('Failed to clear cache:', error);
    }
  }

  async clearAuthCache(): Promise<void> {
    await this.clearCache();
  }
}
