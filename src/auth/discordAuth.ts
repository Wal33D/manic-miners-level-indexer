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
  token?: string;
  userId?: string;
  username?: string;
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

  constructor(cacheDir: string = './output/.auth') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'discord-token.json');
    this.sessionFile = path.join(cacheDir, 'discord-session.json');
  }

  async getToken(options?: { token?: string; tokenFile?: string }): Promise<AuthResult> {
    // Check if we have a cached token that matches the env token
    const envToken = process.env.DISCORD_TOKEN;
    const cached = await this.getCachedToken();

    // If cached token matches env token and is valid, use it immediately
    if (envToken && cached && cached.token === envToken) {
      const isValid = await this.isTokenValid(cached);
      if (isValid) {
        logger.info('Using cached Discord token (matches env token)');
        return {
          token: cached.token,
          userId: cached.userId,
          username: cached.username,
          expiresAt: cached.expiresAt ? new Date(cached.expiresAt) : undefined,
        };
      }
    }

    // First priority: Check DISCORD_TOKEN from .env and validate by hitting Discord servers
    if (envToken) {
      logger.info('Found DISCORD_TOKEN in environment, validating...');
      const isValid = await this.validateTokenWithServerCheck(envToken);
      if (isValid) {
        logger.success('Environment Discord token is valid, using it');
        const result = { token: envToken };
        await this.cacheToken(result);
        return result;
      } else {
        logger.warn(
          'Environment Discord token is invalid or expired, proceeding with authentication'
        );
      }
    }

    // Try to get cached token second (if not already checked above)
    if (cached && (!envToken || cached.token !== envToken)) {
      logger.debug(`Found cached token for user: ${cached.username || 'unknown'}`);
      const isValid = await this.isTokenValid(cached);
      if (isValid) {
        logger.info('Using cached Discord token');
        return {
          token: cached.token,
          userId: cached.userId,
          username: cached.username,
          expiresAt: cached.expiresAt ? new Date(cached.expiresAt) : undefined,
        };
      } else {
        logger.warn('Cached token is invalid or expired');
      }
    } else {
      logger.debug('No cached token found');
    }

    // Try to get token from other sources (token parameter, file, etc.)
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

      // Try multiple headless authentication strategies
      const headlessStrategies = [
        { name: 'session-restore', useSession: true },
        { name: 'standard-login', useSession: false },
        { name: 'alternative-ua', useSession: false, alternativeUA: true },
      ];

      for (const strategy of headlessStrategies) {
        try {
          logger.info(`Trying headless strategy: ${strategy.name}`);
          const result = await this.authenticateWithPlaywright(true, email, password, strategy);
          if (result) {
            logger.success(`Headless authentication succeeded with strategy: ${strategy.name}`);
            return result;
          }
        } catch (error) {
          logger.warn(`Headless strategy ${strategy.name} failed:`, error);
          // Continue to next strategy
        }
      }

      logger.warn('All headless authentication attempts failed');
    }

    // Only show browser if we truly need manual intervention
    logger.info('Manual intervention required - opening browser window...');
    logger.info('This typically happens when:');
    logger.info('- No saved session exists');
    logger.info('- CAPTCHA verification is required');
    logger.info('- Account requires additional security verification');

    // Fall back to manual login with visible browser
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

      if (!response.ok) {
        logger.warn(`Token validation failed with status: ${response.status}`);
        return false;
      }

      // Update cached user info while we're validating
      try {
        const user = await response.json();
        const cached = await this.getCachedToken();
        if (cached && cached.token === token) {
          cached.userId = user.id;
          cached.username = user.username;
          await fs.writeFile(this.cacheFile, JSON.stringify(cached, null, 2));
        }
      } catch (error) {
        // Ignore errors updating cache
      }

      return true;
    } catch (error) {
      logger.error('Token validation error:', error);
      return false;
    }
  }

  private async validateTokenWithServerCheck(token: string): Promise<boolean> {
    try {
      // First do basic token validation
      const basicValidation = await this.validateToken(token);
      if (!basicValidation) {
        return false;
      }

      // Then try to access a Discord server page to ensure we're properly logged in
      const response = await fetch('https://discord.com/api/v9/users/@me/guilds', {
        headers: {
          Authorization: token,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          logger.warn('Discord API rate limit hit during validation');
          // If we're rate limited but basic validation passed, consider it valid
          // The actual request will handle rate limiting properly
          return basicValidation;
        }
        logger.warn(`Server access check failed with status: ${response.status}`);
        return false;
      }

      logger.debug('Token validation passed: can access user profile and server list');
      return true;
    } catch (error) {
      logger.error('Token server validation error:', error);
      return false;
    }
  }

  private async cacheToken(result: AuthResult, saveToEnv: boolean = false): Promise<void> {
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

      // Save to .env file if requested and token is different from current env
      if (saveToEnv && process.env.DISCORD_TOKEN !== result.token) {
        await this.saveTokenToEnv(result.token);
      }
    } catch (error) {
      logger.warn('Failed to cache token:', error);
    }
  }

  private async saveTokenToEnv(token: string): Promise<void> {
    try {
      const envPath = path.resolve('.env');
      let envContent = '';

      // Read existing .env file if it exists
      if (await fs.pathExists(envPath)) {
        envContent = await fs.readFile(envPath, 'utf-8');
      }

      // Update or add DISCORD_TOKEN
      const tokenRegex = /^DISCORD_TOKEN=.*$/m;
      const newTokenLine = `DISCORD_TOKEN=${token}`;

      if (tokenRegex.test(envContent)) {
        // Replace existing DISCORD_TOKEN
        envContent = envContent.replace(tokenRegex, newTokenLine);
        logger.info('Updated DISCORD_TOKEN in .env file');
      } else {
        // Add new DISCORD_TOKEN
        if (envContent && !envContent.endsWith('\n')) {
          envContent += '\n';
        }
        envContent += `${newTokenLine}\n`;
        logger.info('Added DISCORD_TOKEN to .env file');
      }

      await fs.writeFile(envPath, envContent);

      // Update process.env for immediate use
      process.env.DISCORD_TOKEN = token;
    } catch (error) {
      logger.warn('Failed to save token to .env file:', error);
    }
  }

  private async saveSession(
    context: BrowserContext,
    authResult?: { token?: string; userId?: string; username?: string }
  ): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir);

      // Get cookies
      const cookies = await context.cookies();

      // Get localStorage data
      let localStorage: Record<string, string> = {};
      if (this.page) {
        try {
          localStorage = await this.page.evaluate(() => {
            const data: Record<string, string> = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (key) {
                data[key] = window.localStorage.getItem(key) || '';
              }
            }
            return data;
          });
        } catch (error) {
          logger.debug('Failed to get localStorage:', error);
        }
      }

      const sessionData: SessionData = {
        cookies,
        localStorage,
        token: authResult?.token,
        userId: authResult?.userId,
        username: authResult?.username,
      };

      // Encrypt session data
      const encryptedData = this.encryptData(JSON.stringify(sessionData));

      await fs.writeFile(this.sessionFile, encryptedData);
      logger.info('Discord session saved successfully');
    } catch (error) {
      logger.warn('Failed to save session:', error);
    }
  }

  private async loadSession(context: BrowserContext): Promise<SessionData | null> {
    try {
      if (!(await fs.pathExists(this.sessionFile))) {
        return null;
      }

      const encryptedData = await fs.readFile(this.sessionFile, 'utf-8');
      const sessionData: SessionData = JSON.parse(this.decryptData(encryptedData));

      // Check if session has a valid token
      if (sessionData.token && (await this.validateToken(sessionData.token))) {
        logger.info('Found valid token in saved session');
        // Return the session data so we can use the token
        return sessionData;
      }

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
      return sessionData;
    } catch (error) {
      logger.warn('Failed to load session:', error);
      return null;
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
    password?: string,
    strategy?: { name: string; useSession?: boolean; alternativeUA?: boolean }
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
        const sessionData = await this.loadSession(this.context);

        // Check if session has a valid token we can use immediately
        if (sessionData?.token && headless) {
          logger.info('Using token from saved session');
          const result: AuthResult = {
            token: sessionData.token,
            userId: sessionData.userId,
            username: sessionData.username,
          };
          await this.cacheToken(result);
          return result;
        }

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
        const isLoggedIn =
          sessionData ||
          (await this.page
            .waitForSelector('[data-list-id="guildsnav"]', { timeout: 5000 })
            .catch(() => null));

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

            // Save session for future use (will capture token later)
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

          // Save session for future use (will capture token later)
          await this.saveSession(this.context);

          // Wait for page to stabilize
          await this.page.waitForTimeout(3000);

          // Force a request to the @me endpoint
          await this.page.evaluate(() => {
            fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
          });

          await this.page.waitForTimeout(2000);
        }

        // If we still don't have a token, try various extraction methods
        if (!capturedToken) {
          logger.info('Token not captured yet, trying extraction methods...');

          // Method 1: Try to extract from localStorage
          try {
            const localStorageToken = await this.page.evaluate(() => {
              // Discord stores token in localStorage under various keys
              const possibleKeys = ['token', 'tokens', 'user_token', 'auth_token'];

              // Check direct keys
              for (const key of possibleKeys) {
                const value = localStorage.getItem(key);
                if (value && value.length > 20) {
                  return value;
                }
              }

              // Check all localStorage items for token-like values
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                  const value = localStorage.getItem(key);
                  if (value && value.length > 50 && value.match(/^[\w-]+\.[\w-]+\.[\w-]+$/)) {
                    return value;
                  }
                }
              }

              return null;
            });

            if (localStorageToken) {
              capturedToken = localStorageToken;
              logger.info('Successfully extracted token from localStorage');
            }
          } catch (error) {
            logger.debug('localStorage extraction failed:', error);
          }

          // Method 2: Navigate to trigger API requests
          if (!capturedToken) {
            await this.page.goto('https://discord.com/channels/@me', { waitUntil: 'networkidle' });
            await this.page.waitForTimeout(3000);

            // Try clicking around to trigger API requests
            try {
              const userArea = await this.page.$('[class*="panels-"] [class*="container-"]');
              if (userArea) {
                await userArea.click();
                await this.page.waitForTimeout(1000);
              }
            } catch (error) {
              // Ignore errors here
            }
          }

          // Method 3: Force API calls and intercept
          if (!capturedToken) {
            try {
              // Execute multiple API calls to increase chances of token capture
              await this.page.evaluate(() => {
                // Force various API calls
                fetch('/api/v9/users/@me', { credentials: 'include' }).catch(() => {});
                fetch('/api/v9/users/@me/guilds', { credentials: 'include' }).catch(() => {});
                fetch('/api/v9/users/@me/channels', { credentials: 'include' }).catch(() => {});

                // Try to access the token from window properties
                // @ts-expect-error - Discord's webpack internals for token access
                if (window.webpackChunkdiscord_app) {
                  try {
                    const modules: { c?: Record<string, unknown> } =
                      // @ts-expect-error - Accessing Discord's internal webpack modules
                      window.webpackChunkdiscord_app.push([[Symbol()], {}, (e: unknown) => e]);
                    const moduleValues = Object.values(modules.c || {}) as Array<{
                      exports?: { default?: { getToken?: () => string } };
                    }>;
                    const tokenModule = moduleValues.find(m => m?.exports?.default?.getToken);
                    const token = tokenModule?.exports?.default?.getToken?.();
                    if (token) {
                      // Store in localStorage for extraction
                      localStorage.setItem('extracted_token', token);
                    }
                  } catch (e) {
                    // Ignore errors
                  }
                }
              });

              await this.page.waitForTimeout(2000);

              // Try to get the extracted token
              const extractedToken = await this.page.evaluate(() => {
                const token = localStorage.getItem('extracted_token');
                localStorage.removeItem('extracted_token');
                return token;
              });

              if (extractedToken) {
                capturedToken = extractedToken;
                logger.info('Successfully extracted token using webpack method');
              }
            } catch (error) {
              logger.debug('Advanced extraction methods failed:', error);
            }
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

        // Cache the token and save to .env if we got it through authentication
        const shouldSaveToEnv =
          !process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN !== capturedToken;
        await this.cacheToken(result, shouldSaveToEnv);

        // Save session with the captured token for future headless use
        await this.saveSession(this.context, result);

        logger.success(
          `Discord authentication successful! Token captured for user: ${username || userId || 'unknown'}`
        );

        if (shouldSaveToEnv) {
          logger.info('New token saved to .env file for future automatic authentication');
        }

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
