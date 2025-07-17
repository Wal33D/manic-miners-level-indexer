import { chromium, Browser, Page } from 'playwright';
import { DiscordMessage, Level, LevelMetadata, MapSource, IndexerProgress, IndexerResult } from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import path from 'path';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import chalk from 'chalk';

interface ForumPost {
  id: string;
  title: string;
  index: number;
  element?: any;
}

export class DiscordIndexer {
  private channels: string[];
  private maxPages: number;
  private outputDir: string;
  private processedMessages: Set<string> = new Set();
  private browser?: Browser;
  private page?: Page;

  constructor(channels: string[], maxPages: number, outputDir: string) {
    this.channels = channels;
    this.maxPages = maxPages;
    this.outputDir = outputDir;
  }

  async indexDiscord(progressCallback?: (progress: IndexerProgress) => void): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.info('Starting Discord indexing with chunk-based processing...');
      
      // Load previously processed messages
      await this.loadProcessedMessages();

      // Launch browser in headless mode
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();
      
      // Set up better user agent and viewport
      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // Use a taller viewport and zoom out to see more posts
      await this.page.setViewportSize({ width: 1920, height: 1400 });
      
      // Zoom out to 25% to see ~26 posts at once
      await this.page.evaluate(() => {
        document.body.style.zoom = '0.25';
      });
      logger.info('Set zoom to 25% for maximum visibility (~26 posts)');

      // Navigate to Discord and handle login
      await this.setupDiscordSession();

      for (let channelIndex = 0; channelIndex < this.channels.length; channelIndex++) {
        const channel = this.channels[channelIndex];
        
        progressCallback?.({
          phase: 'scraping',
          source: MapSource.DISCORD,
          current: channelIndex,
          total: this.channels.length,
          message: `Scraping channel ${channelIndex + 1}/${this.channels.length}...`
        });

        const channelMessages = await this.scrapeForumChannel(channel);
        
        progressCallback?.({
          phase: 'downloading',
          source: MapSource.DISCORD,
          current: 0,
          total: channelMessages.length,
          message: `Processing ${channelMessages.length} messages from channel...`
        });

        for (let i = 0; i < channelMessages.length; i++) {
          const message = channelMessages[i];
          
          try {
            if (this.processedMessages.has(message.id)) {
              levelsSkipped++;
              continue;
            }

            const levels = await this.processDiscordMessage(message);
            for (const level of levels) {
              await this.saveLevelData(level);
              levelsProcessed++;
              logger.info(`Processed Discord level: ${level.metadata.title}`);
            }

            this.processedMessages.add(message.id);
            
          } catch (error) {
            const errorMsg = `Failed to process Discord message ${message.id}: ${error}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            levelsSkipped++;
          }

          progressCallback?.({
            phase: 'downloading',
            source: MapSource.DISCORD,
            current: i + 1,
            total: channelMessages.length,
            message: `Processing message ${i + 1}/${channelMessages.length}...`
          });
        }
      }

      await this.saveProcessedMessages();

      logger.success(`Discord indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`);
      
      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMsg = `Discord indexing failed: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      
      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime
      };
    } finally {
      await this.cleanup();
    }
  }

  private async setupDiscordSession(): Promise<void> {
    try {
      logger.info('Setting up Discord session...');
      
      // Navigate to Discord
      await this.page!.goto('https://discord.com/login', { waitUntil: 'networkidle' });
      
      // Check if already logged in
      const isLoggedIn = await this.page!.waitForSelector('[data-list-id="guildsnav"]', {
        timeout: 5000
      }).catch(() => null);
      
      if (isLoggedIn) {
        logger.success('Already logged in to Discord');
        return;
      }

      // Wait for login form
      await this.page!.waitForSelector('input[name="email"]', { timeout: 10000 });
      
      // Check if we have credentials
      const email = process.env.DISCORD_EMAIL;
      const password = process.env.DISCORD_PASSWORD;
      
      if (email && password) {
        logger.info('Attempting automatic login...');
        
        // Enter email
        await this.page!.fill('input[name="email"]', email);
        await this.page!.waitForTimeout(500);
        
        // Enter password  
        await this.page!.fill('input[name="password"]', password);
        await this.page!.waitForTimeout(500);
        
        // Click login button
        await this.page!.click('button[type="submit"]');
        
        logger.info('Login submitted, waiting for Discord to load...');
      } else {
        console.log(chalk.yellow('\n=== DISCORD LOGIN REQUIRED ==='));
        console.log(chalk.white('Please log in to Discord in the browser window that opened.'));
        console.log(chalk.white('The indexer will automatically continue once you are logged in.'));
        console.log(chalk.white('This window will wait for up to 5 minutes for login to complete.'));
        console.log(chalk.yellow('===============================\n'));
      }

      // Wait for successful login (look for guild navigation)
      await this.page!.waitForSelector('[data-list-id="guildsnav"]', {
        timeout: 300000 // 5 minutes
      });
      
      logger.success('Successfully logged in to Discord');
      
      // Wait a bit for Discord to fully load
      await this.page!.waitForTimeout(3000);
      
    } catch (error) {
      logger.error('Failed to set up Discord session:', error);
      throw new Error('Discord login failed or timed out');
    }
  }
  
  private async scrapeForumChannel(channelUrl: string): Promise<DiscordMessage[]> {
    logger.info(`Scraping Discord channel: ${channelUrl}`);
    
    // Navigate to the channel
    await this.page!.goto(channelUrl, { waitUntil: 'networkidle' });
    await this.page!.waitForTimeout(3000);
    
    // Apply zoom again after navigation
    await this.page!.evaluate(() => {
      document.body.style.zoom = '0.25';
    });
    logger.info('Applied 25% zoom to forum view');
    
    // Find and focus the forum container - try multiple selectors
    let container = await this.page!.$('div[data-list-id^="forum-channel-list"]');
    if (!container) {
      // Try alternative selectors for forum channels
      container = await this.page!.$('[class*="container_"][class*="forum"]');
      if (!container) {
        // Try to find any scrollable content area
        container = await this.page!.$('[class*="scroller"][class*="auto"]');
        if (!container) {
          logger.error('Forum container not found');
          return [];
        }
      }
    }
    
    await container.click();
    await this.page!.waitForTimeout(1000);
    await container.focus();
    logger.info('Focused forum container for keyboard scrolling');
    
    // Start from the top
    logger.info('Starting chunk-based processing from top of forum...');
    await this.page!.keyboard.press('Home');
    await this.page!.waitForTimeout(2000);
    
    const allMessages: DiscordMessage[] = [];
    const processedPostIds = new Set<string>();
    let foundRageRoad = false;
    let foundCrystalClicker = false;
    let consecutiveEmptyChunks = 0;
    let totalProcessed = 0;
    let lastProcessedTitle = '';
    let stuckCounter = 0;
    let previousChunkSize = 0;
    let lastChunkPosts: string[] = [];  // Track post IDs from last chunk
    
    // Process posts in chunks
    while (!foundCrystalClicker && consecutiveEmptyChunks < 3) {
      // Get currently visible posts
      let visiblePosts = await this.getVisibleForumPosts();
      
      if (visiblePosts.length === 0) {
        consecutiveEmptyChunks++;
        logger.warn(`No visible posts found (attempt ${consecutiveEmptyChunks})`);
        
        // Try scrolling more aggressively
        await this.page!.keyboard.press('PageDown');
        await this.page!.waitForTimeout(2000);
        continue;
      }
      
      consecutiveEmptyChunks = 0;
      
      // Find the bottom-most visible post to track progress
      const bottomPost = visiblePosts[visiblePosts.length - 1];
      const isStuck = bottomPost && bottomPost.title === lastProcessedTitle;
      
      if (isStuck) {
        stuckCounter++;
        if (stuckCounter > 3) {
          logger.warn(`Stuck at "${lastProcessedTitle}" - forcing scroll down`);
          // Force scroll down multiple pages
          for (let s = 0; s < 5; s++) {
            await this.page!.keyboard.press('PageDown');
            await this.page!.waitForTimeout(400);
          }
          stuckCounter = 0;
          continue;
        }
      } else {
        stuckCounter = 0;
      }
      
      // Log what's visible in this chunk
      if (visiblePosts.length > 0) {
        const firstTitle = visiblePosts[0].title;
        const lastTitle = visiblePosts[visiblePosts.length - 1].title;
        logger.info(`Visible chunk: "${firstTitle}" ... "${lastTitle}" (${visiblePosts.length} posts)`);
      }
      
      // Find overlap with previous chunk
      let overlapIndex = -1;
      let currentChunkIds = visiblePosts.map(p => p.id);
      
      if (lastChunkPosts.length > 0) {
        // Find where current chunk overlaps with previous chunk
        for (let i = 0; i < currentChunkIds.length; i++) {
          if (lastChunkPosts.includes(currentChunkIds[i])) {
            overlapIndex = i;
            // Find the last overlapping post
            while (i < currentChunkIds.length && lastChunkPosts.includes(currentChunkIds[i])) {
              overlapIndex = i;
              i++;
            }
            break;
          }
        }
        
        if (overlapIndex >= 0) {
          logger.info(`Found overlap at index ${overlapIndex}. Skipping already processed posts.`);
        } else {
          logger.warn('No overlap found with previous chunk - may have scrolled too far!');
          
          // Try scrolling back up to find overlap
          logger.info('Scrolling back up to find overlap...');
          let scrollBackAttempts = 0;
          let foundOverlap = false;
          
          while (!foundOverlap && scrollBackAttempts < 5) {
            // Scroll up a bit
            for (let s = 0; s < 5; s++) {
              await this.page!.keyboard.press('ArrowUp');
              await this.page!.waitForTimeout(50);
            }
            await this.page!.waitForTimeout(1000);
            
            // Check for overlap again
            const afterScrollBack = await this.getVisibleForumPosts();
            const afterScrollBackIds = afterScrollBack.map(p => p.id);
            
            for (let i = 0; i < afterScrollBackIds.length; i++) {
              if (lastChunkPosts.includes(afterScrollBackIds[i])) {
                foundOverlap = true;
                logger.success('Found overlap after scrolling back!');
                visiblePosts = afterScrollBack;
                currentChunkIds.length = 0;
                currentChunkIds.push(...afterScrollBackIds);
                overlapIndex = i;
                break;
              }
            }
            
            scrollBackAttempts++;
          }
          
          if (!foundOverlap) {
            logger.error('Could not find overlap after scrolling back. Some posts may be missed.');
          }
        }
      }
      
      // Process each visible post that we haven't processed yet
      let processedInThisChunk = 0;
      let newPostsInChunk = false;
      
      for (let i = 0; i < visiblePosts.length; i++) {
        const post = visiblePosts[i];
        
        // Skip posts before the overlap ends
        if (overlapIndex >= 0 && i <= overlapIndex) {
          continue;
        }
        if (processedPostIds.has(post.id)) {
          continue; // Skip already processed posts
        }
        
        newPostsInChunk = true;
        
        // Check for target posts
        if (post.title.toLowerCase().includes('rage road')) {
          foundRageRoad = true;
          logger.info('✓ Found Rage Road (first post)');
        }
        if (post.title.toLowerCase().includes('crystal clicker')) {
          foundCrystalClicker = true;
          logger.info('✓ Found Operation Crystal Clicker (last post)');
        }
        
        // Skip guidelines and already processed posts more efficiently
        if (post.title.toLowerCase().includes('rules') || 
            post.title.toLowerCase().includes('guidelines')) {
          processedPostIds.add(post.id);
          logger.debug(`Skipping guidelines post: ${post.title}`);
          continue;
        }
        
        // Check if we already have messages from this post (in case of duplicates)
        const alreadyHasMessages = allMessages.some(msg => 
          msg.id && msg.id.includes(post.id)
        );
        
        if (alreadyHasMessages) {
          logger.debug(`Skipping duplicate post: ${post.title}`);
          processedPostIds.add(post.id);
          continue;
        }
        
        logger.info(`Processing: ${post.title}`);
        
        // Process this post immediately while it's visible
        const messages = await this.processForumPost(post);
        allMessages.push(...messages);
        
        processedPostIds.add(post.id);
        processedInThisChunk++;
        totalProcessed++;
        lastProcessedTitle = post.title;
        
        // Small delay between posts
        await this.page!.waitForTimeout(500);
      }
      
      logger.info(`Chunk complete: processed ${processedInThisChunk} new posts, total unique: ${totalProcessed}`);
      
      // Save current chunk's post IDs for overlap detection
      lastChunkPosts = currentChunkIds;
      
      // Check if we might be at the end (significantly fewer posts visible than before)
      const possiblyAtEnd = visiblePosts.length < 25 && previousChunkSize > 30;  // Adjusted for 25% zoom showing ~35 posts
      previousChunkSize = visiblePosts.length;
      
      // Scroll to reveal next chunk
      if (!foundCrystalClicker && !isStuck) {
        // Only scroll if we processed new posts or haven't found all posts
        if (newPostsInChunk || totalProcessed === 0) {
          if (possiblyAtEnd && !foundCrystalClicker) {
            logger.info('Possibly at end of list (fewer posts visible). Scrolling more to check for remaining posts...');
            // Continue scrolling down aggressively to find any remaining posts
            for (let j = 0; j < 3; j++) {
              await this.page!.keyboard.press('PageDown');
              await this.page!.waitForTimeout(1000);
            }
          } else {
            logger.info('Scrolling to next chunk with intelligent overlap detection...');
            
            // Ensure container is still focused before scrolling
            const container = await this.page!.$('div[data-list-id="forum-channel-list-1139908458968252457"]');
            if (container) {
              await container.focus();
              logger.info('Re-focused forum container before scrolling');
            }
            
            // Aggressive scrolling to ensure we move forward in the list
            // We want the last few posts of current view to become the first posts of next view
            const targetPost = visiblePosts[visiblePosts.length - 3]; // Get 3rd from last post
            
            logger.info(`Target post for next chunk: "${targetPost?.title || 'unknown'}" should become one of the first posts`);
            logger.info(`Current visible posts: ${visiblePosts.length}`);
            
            // We need to scroll enough that the target post (near the end) becomes near the beginning
            // This means scrolling by almost the entire list length
            const baseScrollSteps = visiblePosts.length - 3; // Minimum scrolling needed
            const extraScroll = Math.floor(visiblePosts.length * 0.1); // Add 10% more for safety
            const scrollSteps = baseScrollSteps + extraScroll;
            
            logger.info(`Scrolling down by ${scrollSteps} arrow presses (${baseScrollSteps} base + ${extraScroll} extra)`);
            
            // Focus container again before scrolling
            const containerElement = await this.page!.$('div[data-list-id="forum-channel-list-1139908458968252457"]');
            if (containerElement) {
              await containerElement.focus();
            }
            
            // Scroll in chunks with pauses
            for (let i = 0; i < scrollSteps; i++) {
              await this.page!.keyboard.press('ArrowDown');
              await this.page!.waitForTimeout(25); // Fast but not too fast
              
              // Every 5 arrows, pause briefly
              if (i > 0 && i % 5 === 0) {
                await this.page!.waitForTimeout(100);
              }
              
              // Every 15 arrows, longer pause
              if (i > 0 && i % 15 === 0) {
                await this.page!.waitForTimeout(500);
                logger.info(`Scrolled ${i}/${scrollSteps} arrow presses...`);
              }
            }
            
            // Wait for the list to stabilize
            await this.page!.waitForTimeout(2000);
            
            // Verify we actually moved forward
            const afterScroll = await this.getVisibleForumPosts();
            const foundTarget = afterScroll.find(p => p.id === targetPost?.id);
            const targetIndex = foundTarget ? afterScroll.indexOf(foundTarget) : -1;
            
            logger.info(`After scroll: Target post "${targetPost?.title}" is at index ${targetIndex} of ${afterScroll.length} visible posts`);
            
            if (foundTarget && targetIndex > 5) {
              // Target post is still too far down, need more scrolling
              const additionalScrolls = targetIndex - 2; // Scroll to make it 2nd or 3rd post
              logger.warn(`Target post at index ${targetIndex}, need ${additionalScrolls} more scrolls`);
              
              for (let j = 0; j < additionalScrolls; j++) {
                await this.page!.keyboard.press('ArrowDown');
                await this.page!.waitForTimeout(50);
              }
              await this.page!.waitForTimeout(1000);
            } else if (!foundTarget && afterScroll.length > 0) {
              // Check if we scrolled past the target
              const firstPost = afterScroll[0];
              logger.info(`Target post not found. First visible post is now: "${firstPost.title}"`);
              
              // If we see the same first post as before, the list might have reset
              if (firstPost.id === visiblePosts[0].id) {
                logger.error('List appears to have reset! Trying more aggressive approach...');
                // Try multiple PageDowns
                for (let k = 0; k < 3; k++) {
                  await this.page!.keyboard.press('PageDown');
                  await this.page!.waitForTimeout(1000);
                }
              }
            } else if (foundTarget && targetIndex <= 5) {
              logger.success(`Good positioning! Target post is at index ${targetIndex}`);
            }
          }
        } else {
          // No new posts in this chunk, continue scrolling down
          logger.info('No new posts in chunk, continuing to scroll down...');
          for (let k = 0; k < 5; k++) {
            await this.page!.keyboard.press('PageDown');
            await this.page!.waitForTimeout(500);
          }
        }
      }
    }
    
    logger.info(`Chunk processing complete. Found ${totalProcessed} unique forum posts out of ~90 total`);
    logger.info(`Found Rage Road: ${foundRageRoad} | Found Crystal Clicker: ${foundCrystalClicker}`);
    
    if (!foundCrystalClicker && totalProcessed > 50) {
      logger.warn('Processed over 50 posts but haven\'t found Crystal Clicker yet. It should be near the end of ~90 posts.');
    }
    
    return allMessages;
  }
  
  private async getVisibleForumPosts(): Promise<ForumPost[]> {
    return await this.page!.evaluate(() => {
      const posts: ForumPost[] = [];
      const cards = document.querySelectorAll('li.card_f369db');
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement;
        
        // Check if card is actually visible
        const rect = card.getBoundingClientRect();
        if (rect.height === 0 || rect.top > window.innerHeight || rect.bottom < 0) {
          continue; // Skip invisible cards
        }
        
        // Extract title
        let title = 'Unknown';
        const titleSelectors = [
          '[class*="heading_"]',
          'h3[class*="postTitleText"]',
          '[class*="title"]',
          'h3'
        ];
        
        for (const selector of titleSelectors) {
          const elem = card.querySelector(selector);
          if (elem?.textContent) {
            title = elem.textContent.trim();
            break;
          }
        }
        
        // Get unique ID
        const linkElement = card.querySelector('a[href*="/channels/"]');
        const href = linkElement?.getAttribute('href') || '';
        const postId = href.split('/').pop() || `post-${i}-${Date.now()}`;
        
        posts.push({
          id: postId,
          title: title,
          index: i
        });
      }
      
      return posts;
    });
  }
  
  private async processForumPost(post: ForumPost): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];
    
    try {
      // Click on the specific forum post
      const cards = await this.page!.$$('li.card_f369db');
      if (!cards[post.index]) {
        logger.warn(`Card not found at index ${post.index} for post: ${post.title}`);
        return messages;
      }
      
      await cards[post.index].click();
      await this.page!.waitForTimeout(3000); // Wait for content to load
      
      // Extract messages with attachments
      const extractedData = await this.page!.evaluate(() => {
        const messageContainers = [
          '[class*="messagesWrapper"]',
          '[class*="chatContent-"]',
          '[class*="content-"] [class*="message-"]'
        ];
        
        let mainContainer = null;
        for (const selector of messageContainers) {
          const container = document.querySelector(selector);
          if (container) {
            mainContainer = container;
            break;
          }
        }
        
        if (!mainContainer) return { messages: [], error: 'No message container found' };
        
        const messages: any[] = [];
        const messageElements = mainContainer.querySelectorAll('[id^="message-"]');
        
        messageElements.forEach(element => {
          const authorElement = element.querySelector('[class*="username-"]');
          const author = authorElement?.textContent?.trim() || 'Unknown';
          
          const contentElement = element.querySelector('[class*="messageContent-"]');
          const content = contentElement?.textContent?.trim() || '';
          
          const timestampElement = element.querySelector('time');
          const timestamp = timestampElement?.getAttribute('datetime') || new Date().toISOString();
          
          const attachments: any[] = [];
          const links = element.querySelectorAll('a');
          
          links.forEach(link => {
            const href = link.href || '';
            const text = link.textContent || '';
            
            if ((href.includes('cdn.discordapp.com/attachments/') || 
                 href.includes('media.discordapp.net/attachments/')) &&
                (text.toLowerCase().includes('.dat') || 
                 href.toLowerCase().includes('.dat'))) {
              
              let filename = text.trim();
              if (!filename.endsWith('.dat')) {
                const urlMatch = href.match(/\/([^\/\?]+\.dat)/i);
                filename = urlMatch ? urlMatch[1] : 'unknown.dat';
              }
              
              attachments.push({
                filename,
                url: href,
                size: 0
              });
            }
          });
          
          if (attachments.length > 0) {
            messages.push({
              id: element.id,
              author,
              content,
              timestamp,
              attachments
            });
          }
        });
        
        return { messages, error: null };
      });
      
      if (extractedData.error) {
        logger.warn(`Error extracting messages: ${extractedData.error}`);
      } else if (extractedData.messages.length > 0) {
        logger.info(`Found ${extractedData.messages.length} messages with .dat files in post: ${post.title}`);
        messages.push(...extractedData.messages);
      }
      
      // Close the post by pressing Escape
      await this.page!.keyboard.press('Escape');
      await this.page!.waitForTimeout(1000);
      
      // Refocus the forum container
      const container = await this.page!.$('div[data-list-id="forum-channel-list-1139908458968252457"]');
      if (container) {
        await container.focus();
      }
      
    } catch (error) {
      logger.error(`Failed to process forum post "${post.title}":`, error);
    }
    
    return messages;
  }

  private async processDiscordMessage(message: DiscordMessage): Promise<Level[]> {
    const levels: Level[] = [];
    
    try {
      for (const attachment of message.attachments) {
        const level = await this.createLevelFromDiscordAttachment(attachment, message);
        if (level) {
          levels.push(level);
        }
      }
      
      return levels;
    } catch (error) {
      logger.error(`Failed to process Discord message ${message.id}:`, error);
      return levels;
    }
  }

  private async createLevelFromDiscordAttachment(attachment: any, message: DiscordMessage): Promise<Level | null> {
    try {
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, 'levels', levelId);
      await FileUtils.ensureDir(levelDir);
      
      const datFileName = FileUtils.sanitizeFilename(attachment.filename);
      const localDatPath = path.join(levelDir, datFileName);
      
      // Download the .dat file
      await this.downloadFile(attachment.url, localDatPath);
      
      // Extract level name from filename (remove .dat extension)
      const levelName = path.basename(datFileName, '.dat');
      
      const metadata: LevelMetadata = {
        id: levelId,
        title: levelName,
        author: message.author,
        description: message.content || `Level shared on Discord by ${message.author}`,
        postedDate: new Date(message.timestamp),
        source: MapSource.DISCORD,
        sourceUrl: `https://discord.com/channels/${message.id}`,
        originalId: message.id,
        tags: ['discord', 'community']
      };
      
      const levelFiles = [{
        filename: datFileName,
        path: localDatPath,
        size: await FileUtils.getFileSize(localDatPath),
        hash: await FileUtils.getFileHash(localDatPath),
        type: 'dat' as const
      }];
      
      const level: Level = {
        metadata,
        files: levelFiles,
        catalogPath: levelDir,
        datFilePath: localDatPath,
        indexed: new Date(),
        lastUpdated: new Date()
      };
      
      return level;
      
    } catch (error) {
      logger.error(`Failed to create level from Discord attachment ${attachment.filename}:`, error);
      return null;
    }
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    if (response.body) {
      const fileStream = fs.createWriteStream(filePath);
      
      await new Promise<void>((resolve, reject) => {
        response.body!.pipe(fileStream);
        response.body!.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    }
  }

  private async loadProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_processed.json');
    const processed = await FileUtils.readJSON<string[]>(processedPath);
    
    if (processed) {
      this.processedMessages = new Set(processed);
    }
  }

  private async saveProcessedMessages(): Promise<void> {
    const processedPath = path.join(this.outputDir, 'discord_processed.json');
    await FileUtils.writeJSON(processedPath, Array.from(this.processedMessages));
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      logger.warn('Failed to cleanup browser:', error);
    }
  }
}