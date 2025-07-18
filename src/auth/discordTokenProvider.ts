import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Provides Discord tokens from various sources in priority order:
 * 1. Direct token parameter
 * 2. Token file path
 * 3. Environment variable DISCORD_TOKEN
 * 4. Environment variable DISCORD_USER_TOKEN
 * 5. Token file in home directory (~/.discord-token)
 */
export class DiscordTokenProvider {
  static async getToken(options?: { token?: string; tokenFile?: string }): Promise<string | null> {
    // 1. Direct token parameter
    if (options?.token) {
      logger.info('Using Discord token from direct parameter');
      return options.token;
    }

    // 2. Token file path
    if (options?.tokenFile) {
      try {
        const tokenPath = path.resolve(options.tokenFile);
        if (await fs.pathExists(tokenPath)) {
          const token = (await fs.readFile(tokenPath, 'utf-8')).trim();
          if (token) {
            logger.info(`Using Discord token from file: ${tokenPath}`);
            return token;
          }
        }
      } catch (error) {
        logger.warn(`Failed to read token file: ${options.tokenFile}`, error);
      }
    }

    // 3. Environment variable DISCORD_TOKEN
    if (process.env.DISCORD_TOKEN) {
      logger.info('Using Discord token from DISCORD_TOKEN environment variable');
      return process.env.DISCORD_TOKEN;
    }

    // 4. Environment variable DISCORD_USER_TOKEN
    if (process.env.DISCORD_USER_TOKEN) {
      logger.info('Using Discord token from DISCORD_USER_TOKEN environment variable');
      return process.env.DISCORD_USER_TOKEN;
    }

    // 5. Token file in home directory
    const homeTokenPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.discord-token'
    );
    try {
      if (await fs.pathExists(homeTokenPath)) {
        const token = (await fs.readFile(homeTokenPath, 'utf-8')).trim();
        if (token) {
          logger.info('Using Discord token from home directory file');
          return token;
        }
      }
    } catch (error) {
      // Silently ignore home directory token file errors
    }

    return null;
  }

  /**
   * Validates a Discord token by making a test API call
   */
  static async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: {
          Authorization: token,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const user = await response.json();
        logger.info(`Token validated for user: ${user.username}#${user.discriminator}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return false;
    }
  }
}
