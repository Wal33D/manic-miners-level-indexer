import { ConfigManager } from '../config/configManager';
import { defaultConfig } from '../config/default';
import { FileUtils } from '../utils/fileUtils';
import { IndexerConfig } from '../types';
import fs from 'fs-extra';
import path from 'path';
import { TestPaths } from './test-config';

describe('ConfigManager', () => {
  const testDir = TestPaths.unit.configManager;
  const configPath = path.join(testDir, 'test-config.json');
  let configManager: ConfigManager;

  beforeEach(async () => {
    await fs.ensureDir(testDir);
    configManager = new ConfigManager(configPath);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('loadConfig', () => {
    it('should load default config when no file exists', async () => {
      const config = await configManager.loadConfig();

      expect(config).toEqual(defaultConfig);
    });

    it('should merge existing config with defaults', async () => {
      const partialConfig = {
        outputDir: '/custom/output',
        sources: {
          internet_archive: {
            enabled: false,
          },
        },
      };

      await FileUtils.writeJSON(configPath, partialConfig);
      const config = await configManager.loadConfig();

      expect(config.outputDir).toBe('/custom/output');
      expect(config.sources.internet_archive.enabled).toBe(false);
      expect(config.sources.internet_archive.baseUrl).toBe(
        defaultConfig.sources.internet_archive.baseUrl
      );
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      await configManager.loadConfig();
      configManager.setOutputDir('/test/output');
      await configManager.saveConfig();

      const savedConfig = await FileUtils.readJSON<IndexerConfig>(configPath);
      expect(savedConfig?.outputDir).toBe('/test/output');
    });
  });

  describe('updateConfig', () => {
    it('should update config in memory', async () => {
      await configManager.loadConfig();

      configManager.updateConfig({
        outputDir: '/new/output',
      });

      const config = configManager.getConfig();
      expect(config.outputDir).toBe('/new/output');
    });
  });

  describe('source management', () => {
    beforeEach(async () => {
      await configManager.loadConfig();
    });

    it('should enable and disable sources', () => {
      configManager.disableSource('internet_archive');
      expect(configManager.getConfig().sources.internet_archive.enabled).toBe(false);

      configManager.enableSource('internet_archive');
      expect(configManager.getConfig().sources.internet_archive.enabled).toBe(true);
    });

    it('should update source config', () => {
      configManager.updateSourceConfig('internet_archive', { baseUrl: 'https://example.com' });
      expect(configManager.getConfig().sources.internet_archive.baseUrl).toBe(
        'https://example.com'
      );
    });

    it('should manage Discord Community channels', () => {
      const testChannel = 'https://discord.com/channels/123/456';

      configManager.addDiscordCommunityChannel(testChannel);
      expect(configManager.getConfig().sources.discord_community.channels).toContain(testChannel);

      configManager.removeDiscordCommunityChannel(testChannel);
      expect(configManager.getConfig().sources.discord_community.channels).not.toContain(
        testChannel
      );
    });

    it('should manage Discord Archive channels', () => {
      const testChannel = 'https://discord.com/channels/789/012';

      configManager.addDiscordArchiveChannel(testChannel);
      expect(configManager.getConfig().sources.discord_archive.channels).toContain(testChannel);

      configManager.removeDiscordArchiveChannel(testChannel);
      expect(configManager.getConfig().sources.discord_archive.channels).not.toContain(testChannel);
    });
  });

  describe('validateConfig', () => {
    beforeEach(async () => {
      await configManager.loadConfig();
    });

    it('should validate valid config', () => {
      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect missing output directory', () => {
      configManager.setOutputDir('');

      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Output directory is required');
    });

    it('should detect missing archive URL when enabled', () => {
      configManager.updateSourceConfig('internet_archive', { baseUrl: '' });

      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Internet Archive base URL is required when Internet Archive source is enabled'
      );
    });

    it('should detect no enabled sources', () => {
      configManager.disableSource('internet_archive');
      configManager.disableSource('discord_community');
      configManager.disableSource('discord_archive');
      configManager.disableSource('hognose');

      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('At least one source must be enabled');
    });
  });

  describe('getEnabledSources', () => {
    it('should return list of enabled sources', async () => {
      await configManager.loadConfig();

      const enabledSources = configManager.getEnabledSources();
      expect(enabledSources).toContain('internet_archive');
      expect(enabledSources).toContain('discord_community');
      expect(enabledSources).toContain('discord_archive');
      expect(enabledSources).toContain('hognose');
    });

    it('should return only enabled sources', async () => {
      await configManager.loadConfig();
      configManager.disableSource('internet_archive');

      const enabledSources = configManager.getEnabledSources();
      expect(enabledSources).not.toContain('internet_archive');
      expect(enabledSources).toContain('discord_community');
      expect(enabledSources).toContain('discord_archive');
      expect(enabledSources).toContain('hognose');
    });
  });
});
