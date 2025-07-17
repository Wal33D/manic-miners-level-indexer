import { IndexerConfig } from '../types';
import { defaultConfig } from './default';
import { FileUtils } from '../utils/fileUtils';
import { logger } from '../utils/logger';
import path from 'path';

export class ConfigManager {
  private config: IndexerConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.config = { ...defaultConfig };
    this.configPath = configPath || path.join(process.cwd(), 'config.json');
  }

  async loadConfig(): Promise<IndexerConfig> {
    try {
      const existingConfig = await FileUtils.readJSON<Partial<IndexerConfig>>(this.configPath);
      
      if (existingConfig) {
        // Merge with default config
        this.config = this.mergeConfigs(defaultConfig, existingConfig);
        logger.info(`Loaded configuration from ${this.configPath}`);
      } else {
        logger.info('No configuration file found, using default config');
        await this.saveConfig();
      }
      
      return this.config;
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      logger.info('Using default configuration');
      return this.config;
    }
  }

  async saveConfig(): Promise<void> {
    try {
      await FileUtils.writeJSON(this.configPath, this.config);
      logger.info(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  getConfig(): IndexerConfig {
    return this.config;
  }

  updateConfig(updates: Partial<IndexerConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);
  }

  async updateAndSaveConfig(updates: Partial<IndexerConfig>): Promise<void> {
    this.updateConfig(updates);
    await this.saveConfig();
  }

  // Source-specific configuration methods
  enableSource(source: keyof IndexerConfig['sources']): void {
    this.config.sources[source].enabled = true;
  }

  disableSource(source: keyof IndexerConfig['sources']): void {
    this.config.sources[source].enabled = false;
  }

  updateSourceConfig(source: keyof IndexerConfig['sources'], updates: any): void {
    this.config.sources[source] = { ...this.config.sources[source], ...updates };
  }

  // Directory configuration
  setOutputDir(dir: string): void {
    this.config.outputDir = dir;
  }

  setTempDir(dir: string): void {
    this.config.tempDir = dir;
  }

  // Rendering configuration
  updateRenderingConfig(updates: Partial<IndexerConfig['rendering']>): void {
    this.config.rendering = { ...this.config.rendering, ...updates };
  }

  enableThumbnails(enable: boolean): void {
    this.config.generateThumbnails = enable;
  }

  enableScreenshots(enable: boolean): void {
    this.config.generateScreenshots = enable;
  }

  // Archive configuration
  setArchiveMaxPages(maxPages: number): void {
    this.config.sources.archive.maxPages = maxPages;
  }

  setArchiveBaseUrl(baseUrl: string): void {
    this.config.sources.archive.baseUrl = baseUrl;
  }

  // Discord configuration
  setDiscordChannels(channels: string[]): void {
    this.config.sources.discord.channels = channels;
  }

  addDiscordChannel(channel: string): void {
    if (!this.config.sources.discord.channels.includes(channel)) {
      this.config.sources.discord.channels.push(channel);
    }
  }

  removeDiscordChannel(channel: string): void {
    this.config.sources.discord.channels = this.config.sources.discord.channels.filter(c => c !== channel);
  }

  setDiscordMaxPages(maxPages: number): void {
    this.config.sources.discord.maxPages = maxPages;
  }

  // Hognose configuration
  setHognoseRepo(repo: string): void {
    this.config.sources.hognose.githubRepo = repo;
  }

  setHognoseCheckInterval(interval: number): void {
    this.config.sources.hognose.checkInterval = interval;
  }

  setHognoseNumberOfLevels(numberOfLevels: number): void {
    this.config.sources.hognose.numberOfLevels = numberOfLevels;
  }

  // Validation
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate output directory
    if (!this.config.outputDir || this.config.outputDir.trim() === '') {
      errors.push('Output directory is required');
    }

    // Validate temp directory
    if (!this.config.tempDir || this.config.tempDir.trim() === '') {
      errors.push('Temp directory is required');
    }

    // Validate archive source
    if (this.config.sources.archive.enabled) {
      if (!this.config.sources.archive.baseUrl) {
        errors.push('Archive base URL is required when archive source is enabled');
      }
      if (!this.config.sources.archive.maxPages || this.config.sources.archive.maxPages < 1) {
        errors.push('Archive max pages must be greater than 0');
      }
    }

    // Validate Discord source
    if (this.config.sources.discord.enabled) {
      if (!this.config.sources.discord.channels || this.config.sources.discord.channels.length === 0) {
        errors.push('Discord channels are required when Discord source is enabled');
      }
      if (!this.config.sources.discord.maxPages || this.config.sources.discord.maxPages < 1) {
        errors.push('Discord max pages must be greater than 0');
      }
    }

    // Validate Hognose source
    if (this.config.sources.hognose.enabled) {
      if (!this.config.sources.hognose.githubRepo) {
        errors.push('Hognose GitHub repository is required when Hognose source is enabled');
      }
      if (!this.config.sources.hognose.checkInterval || this.config.sources.hognose.checkInterval < 1000) {
        errors.push('Hognose check interval must be at least 1000ms');
      }
    }

    // Validate rendering configuration
    if (this.config.rendering.thumbnailSize.width < 1 || this.config.rendering.thumbnailSize.height < 1) {
      errors.push('Thumbnail size must be greater than 0');
    }

    if (this.config.rendering.screenshotSize.width < 1 || this.config.rendering.screenshotSize.height < 1) {
      errors.push('Screenshot size must be greater than 0');
    }

    // Check if at least one source is enabled
    const enabledSources = Object.values(this.config.sources).filter(source => source.enabled);
    if (enabledSources.length === 0) {
      errors.push('At least one source must be enabled');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getEnabledSources(): string[] {
    return Object.entries(this.config.sources)
      .filter(([_, config]) => config.enabled)
      .map(([source, _]) => source);
  }

  private mergeConfigs(base: IndexerConfig, updates: Partial<IndexerConfig>): IndexerConfig {
    const merged = { ...base };

    // Handle nested objects
    if (updates.sources) {
      merged.sources = {
        ...merged.sources,
        archive: { ...merged.sources.archive, ...updates.sources.archive },
        discord: { ...merged.sources.discord, ...updates.sources.discord },
        hognose: { ...merged.sources.hognose, ...updates.sources.hognose }
      };
    }

    if (updates.rendering) {
      merged.rendering = {
        ...merged.rendering,
        ...updates.rendering,
        thumbnailSize: { ...merged.rendering.thumbnailSize, ...updates.rendering.thumbnailSize },
        screenshotSize: { ...merged.rendering.screenshotSize, ...updates.rendering.screenshotSize },
        biomeColors: { ...merged.rendering.biomeColors, ...updates.rendering.biomeColors }
      };
    }

    // Handle primitive properties
    Object.keys(updates).forEach(key => {
      if (key !== 'sources' && key !== 'rendering') {
        (merged as any)[key] = (updates as any)[key];
      }
    });

    return merged;
  }

  async createConfigTemplate(): Promise<string> {
    const templatePath = path.join(process.cwd(), 'config.template.json');
    const template = {
      ...defaultConfig,
      // Add comments as properties (will be ignored by JSON.parse but useful for users)
      _comments: {
        outputDir: "Directory where all indexed levels and catalogs will be stored",
        tempDir: "Temporary directory for processing files",
        generateThumbnails: "Whether to generate thumbnail images for levels",
        generateScreenshots: "Whether to generate full-size screenshots for levels",
        sources: {
          archive: {
            enabled: "Enable Internet Archive indexing",
            baseUrl: "Base URL for Internet Archive API",
            maxPages: "Maximum number of pages to scrape from archive"
          },
          discord: {
            enabled: "Enable Discord channel indexing",
            channels: "List of Discord channel URLs to scrape",
            maxPages: "Maximum number of pages to scrape per channel"
          },
          hognose: {
            enabled: "Enable Hognose GitHub releases indexing",
            githubRepo: "GitHub repository in format 'owner/repo'",
            checkInterval: "Interval in milliseconds to check for new releases"
          }
        },
        rendering: {
          thumbnailSize: "Size of generated thumbnail images",
          screenshotSize: "Size of generated screenshot images",
          biomeColors: "Color mapping for different biome types"
        }
      }
    };

    await FileUtils.writeJSON(templatePath, template);
    logger.info(`Configuration template created at ${templatePath}`);
    return templatePath;
  }
}