import { IndexerConfig } from '../types';

export const defaultConfig: IndexerConfig = {
  outputDir: './output',
  sources: {
    internet_archive: {
      enabled: true,
      baseUrl: 'https://archive.org/advancedsearch.php',
    },
    discord_community: {
      enabled: true,
      channels: [
        '1139908458968252457', // Community levels (v1+)
      ],
    },
    discord_archive: {
      enabled: true,
      channels: [
        '683985075704299520', // Old pre-v1 maps
      ],
    },
    hognose: {
      enabled: true,
      githubRepo: 'charredUtensil/groundhog',
      checkInterval: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
};

export const CATALOG_FILENAMES = {
  INDEX: 'catalog_index.json',
  LEVEL: 'catalog.json',
  MASTER: 'master_index.json',
};
