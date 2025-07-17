import { IndexerConfig } from '../types';

export const defaultConfig: IndexerConfig = {
  outputDir: './output',
  tempDir: './temp',
  generateThumbnails: true,
  generateScreenshots: true,
  sources: {
    archive: {
      enabled: true,
      baseUrl: 'https://archive.org/advancedsearch.php',
    },
    discord: {
      enabled: true,
      channels: [
        'https://discord.com/channels/288873207503347712/288873207503347712',
        'https://discord.com/channels/288873207503347712/574327631175901201',
      ],
    },
    hognose: {
      enabled: true,
      githubRepo: 'charredUtensil/groundhog',
      checkInterval: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
  rendering: {
    thumbnailSize: { width: 200, height: 200 },
    screenshotSize: { width: 800, height: 600 },
    biomeColors: {
      rock: '#8B4513',
      dirt: '#8B4513',
      lava: '#FF4500',
      water: '#4169E1',
      ice: '#87CEEB',
      energy: '#FFD700',
      ore: '#C0C0C0',
      crystal: '#9400D3',
      rubble: '#A0522D',
      path: '#DCDCDC',
      slug: '#228B22',
      erosion: '#FF6347',
      landslide: '#8B4513',
      foundation: '#696969',
      hard: '#2F4F4F',
      solid: '#000000',
      power: '#FFFF00',
      lake: '#1E90FF',
      undiscovered: '#404040',
    },
  },
};

export const BIOME_MAPPINGS: Record<number, string> = {
  0: 'rock',
  1: 'dirt',
  2: 'lava',
  3: 'water',
  4: 'ice',
  5: 'energy',
  6: 'ore',
  7: 'crystal',
  8: 'rubble',
  9: 'path',
  10: 'slug',
  11: 'erosion',
  12: 'landslide',
  13: 'foundation',
  14: 'hard',
  15: 'solid',
  16: 'power',
  17: 'lake',
  18: 'undiscovered',
};

export const FILE_EXTENSIONS = {
  DAT: '.dat',
  PNG: '.png',
  JPG: '.jpg',
  JPEG: '.jpeg',
  JSON: '.json',
  ZIP: '.zip',
};

export const CATALOG_FILENAMES = {
  INDEX: 'catalog_index.json',
  LEVEL: 'catalog.json',
  THUMBNAIL: 'thumbnail.png',
  SCREENSHOT: 'screenshot.png',
  ORIGINAL_THUMBNAIL: 'thumbnail_original.png',
};
