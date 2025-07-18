import { IndexerConfig } from '../types';

export const defaultConfig: IndexerConfig = {
  outputDir: './data',
  tempDir: './temp',
  sources: {
    archive: {
      enabled: true,
      baseUrl: 'https://archive.org/advancedsearch.php',
    },
    discord: {
      enabled: true,
      channels: [
        '683985075704299520', // Old pre-v1 maps
        '1139908458968252457', // Community levels (v1+)
      ],
    },
    hognose: {
      enabled: true,
      githubRepo: 'charredUtensil/groundhog',
      checkInterval: 24 * 60 * 60 * 1000, // 24 hours
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
  MASTER: 'master_index.json',
};
