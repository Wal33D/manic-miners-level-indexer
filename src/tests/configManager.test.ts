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
          archive: {
            enabled: false,
          },
        },
      };

      await FileUtils.writeJSON(configPath, partialConfig);
      const config = await configManager.loadConfig();

      expect(config.outputDir).toBe('/custom/output');
      expect(config.sources.archive.enabled).toBe(false);
      expect(config.sources.archive.baseUrl).toBe(defaultConfig.sources.archive.baseUrl);
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
        generateThumbnails: false,
      });

      const config = configManager.getConfig();
      expect(config.outputDir).toBe('/new/output');
      expect(config.generateThumbnails).toBe(false);
    });
  });

  describe('source management', () => {
    beforeEach(async () => {
      await configManager.loadConfig();
    });

    it('should enable and disable sources', () => {
      configManager.disableSource('archive');
      expect(configManager.getConfig().sources.archive.enabled).toBe(false);

      configManager.enableSource('archive');
      expect(configManager.getConfig().sources.archive.enabled).toBe(true);
    });

    it('should update source config', () => {
      configManager.updateSourceConfig('archive', { baseUrl: 'https://example.com' });
      expect(configManager.getConfig().sources.archive.baseUrl).toBe('https://example.com');
    });

    it('should manage Discord channels', () => {
      const testChannel = 'https://discord.com/channels/123/456';

      configManager.addDiscordChannel(testChannel);
      expect(configManager.getConfig().sources.discord.channels).toContain(testChannel);

      configManager.removeDiscordChannel(testChannel);
      expect(configManager.getConfig().sources.discord.channels).not.toContain(testChannel);
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
      configManager.updateSourceConfig('archive', { baseUrl: '' });

      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Archive base URL is required when archive source is enabled'
      );
    });

    it('should detect no enabled sources', () => {
      configManager.disableSource('archive');
      configManager.disableSource('discord');
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
      expect(enabledSources).toContain('archive');
      expect(enabledSources).toContain('discord');
      expect(enabledSources).toContain('hognose');
    });

    it('should return only enabled sources', async () => {
      await configManager.loadConfig();
      configManager.disableSource('archive');

      const enabledSources = configManager.getEnabledSources();
      expect(enabledSources).not.toContain('archive');
      expect(enabledSources).toContain('discord');
      expect(enabledSources).toContain('hognose');
    });
  });
});
