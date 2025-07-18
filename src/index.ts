import { MasterIndexer } from './catalog/masterIndexer';
import { InternetArchiveIndexer } from './indexers/archive';
import { HognoseIndexer } from './indexers/hognoseIndexer';
import { DiscordIndexer } from './indexers/discordIndexer';
import { CatalogManager } from './catalog/catalogManager';
import { logger } from './utils/logger';

// Export all the main classes for programmatic usage
export {
  MasterIndexer,
  InternetArchiveIndexer as ArchiveIndexer,
  HognoseIndexer,
  DiscordIndexer,
  CatalogManager,
  logger,
};

// Export types
export * from './types';
