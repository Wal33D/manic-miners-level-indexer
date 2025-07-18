import { MasterIndexer } from './catalog/masterIndexer';
import { InternetArchiveIndexer } from './indexers/archive';
import { HognoseIndexer } from './indexers/hognoseIndexer';
import { DiscordUnifiedIndexer } from './indexers/discordUnified';
import { DiscordDirectAPI } from './indexers/discordDirectAPI';
import { DiscordAuth } from './auth/discordAuth';
import { CatalogManager } from './catalog/catalogManager';
import { logger } from './utils/logger';

// Export all the main classes for programmatic usage
export {
  MasterIndexer,
  InternetArchiveIndexer as ArchiveIndexer,
  HognoseIndexer,
  DiscordUnifiedIndexer,
  DiscordUnifiedIndexer as DiscordIndexer, // Alias for backward compatibility
  DiscordDirectAPI,
  DiscordAuth,
  CatalogManager,
  logger,
};

// Export types
export * from './types';
