import { MasterIndexer } from './catalog/masterIndexer';
import { InternetArchiveIndexer } from './indexers/archive';
import { HognoseIndexer } from './indexers/hognoseIndexer';
import { DiscordCommunityIndexer } from './indexers/discord/discordCommunityIndexer';
import { DiscordArchiveIndexer } from './indexers/discord/discordArchiveIndexer';
import { DiscordAuth } from './auth/discordAuth';
import { CatalogManager } from './catalog/catalogManager';
import { logger } from './utils/logger';

// Export all the main classes for programmatic usage
export {
  MasterIndexer,
  InternetArchiveIndexer as ArchiveIndexer,
  HognoseIndexer,
  DiscordCommunityIndexer,
  DiscordArchiveIndexer,
  DiscordCommunityIndexer as DiscordIndexer, // Alias for backward compatibility
  DiscordAuth,
  CatalogManager,
  logger,
};

// Export types
export * from './types';
