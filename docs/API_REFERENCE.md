# API Reference

Complete API documentation for the Manic Miners Level Indexer, including all classes, methods, and interfaces.

## Table of Contents

1. [Core Classes](#core-classes)
   - [MasterIndexer](#masterindexer)
   - [CatalogManager](#catalogmanager)
2. [Indexers](#indexers)
   - [InternetArchiveIndexer](#internetarchiveindexer)
   - [DiscordUnifiedIndexer](#discordunifiedindexer)
   - [HognoseIndexer](#hognoseindexer)
3. [Authentication](#authentication)
   - [DiscordAuth](#discordauth)
   - [DiscordTokenProvider](#discordtokenprovider)
4. [Types and Interfaces](#types-and-interfaces)
5. [Utilities](#utilities)

## Core Classes

### MasterIndexer

The main orchestrator for all indexing operations.

```typescript
import { MasterIndexer } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(config: IndexerConfig)
```

**Parameters:**
- `config`: Configuration object for all indexers

**Example:**
```typescript
const indexer = new MasterIndexer({
  outputDir: './output',
  sources: {
    archive: { enabled: true },
    discord: { enabled: true, channels: ['123456789'] },
    hognose: { enabled: true }
  }
});
```

#### Methods

##### indexAll()
```typescript
async indexAll(): Promise<void>
```
Indexes all enabled sources in parallel.

**Example:**
```typescript
await indexer.indexAll();
console.log('All sources indexed successfully');
```

##### indexArchive()
```typescript
async indexArchive(): Promise<void>
```
Indexes only Archive.org levels.

##### indexDiscord()
```typescript
async indexDiscord(): Promise<void>
```
Indexes only Discord levels.

##### indexHognose()
```typescript
async indexHognose(): Promise<void>
```
Indexes only Hognose repository levels.

##### getCatalogStats()
```typescript
async getCatalogStats(): Promise<CatalogStats>
```
Returns statistics about the indexed catalog.

**Returns:**
```typescript
interface CatalogStats {
  totalLevels: number;
  sources: Record<MapSource, number>;
  lastUpdated: Date;
  oldestLevel?: Date;
  newestLevel?: Date;
}
```

##### exportCatalog()
```typescript
async exportCatalog(format: 'json' | 'csv'): Promise<string>
```
Exports the catalog in the specified format.

**Parameters:**
- `format`: Export format ('json' or 'csv')

**Returns:** Path to the exported file

### CatalogManager

Manages the level catalog and indexes.

```typescript
import { CatalogManager } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(outputDir: string)
```

**Parameters:**
- `outputDir`: Directory for catalog storage

#### Methods

##### addLevel()
```typescript
async addLevel(level: Level): Promise<void>
```
Adds a new level to the catalog.

##### removeLevel()
```typescript
async removeLevel(levelId: string, source: MapSource): Promise<boolean>
```
Removes a level from the catalog.

##### updateLevel()
```typescript
async updateLevel(levelId: string, source: MapSource, updates: Partial<Level>): Promise<boolean>
```
Updates an existing level's metadata.

##### getLevel()
```typescript
async getLevel(levelId: string, source: MapSource): Promise<Level | null>
```
Retrieves a specific level by ID and source.

##### getAllLevels()
```typescript
async getAllLevels(): Promise<Level[]>
```
Returns all levels in the catalog.

##### getLevelsBySource()
```typescript
async getLevelsBySource(source: MapSource): Promise<Level[]>
```
Returns all levels from a specific source.

##### searchLevels()
```typescript
async searchLevels(query: SearchQuery): Promise<Level[]>
```
Searches levels based on criteria.

**SearchQuery Interface:**
```typescript
interface SearchQuery {
  title?: string;
  author?: string;
  tags?: string[];
  source?: MapSource;
  dateFrom?: Date;
  dateTo?: Date;
}
```

## Indexers

### InternetArchiveIndexer

Indexes levels from Archive.org.

```typescript
import { InternetArchiveIndexer } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(config: ArchiveConfig, outputDir: string)
```

**ArchiveConfig:**
```typescript
interface ArchiveConfig {
  baseUrl: string;
  searchQueries?: string[];
  concurrentDownloads?: number;
  maxConcurrentMetadata?: number;
  retryAttempts?: number;
  downloadTimeout?: number;
  bandwidthLimit?: number;
  skipExisting?: boolean;
  verifyChecksums?: boolean;
}
```

#### Methods

##### index()
```typescript
async index(): Promise<Level[]>
```
Performs the indexing operation.

##### setProgressCallback()
```typescript
setProgressCallback(callback: (progress: IndexerProgress) => void): void
```
Sets a callback for progress updates.

### DiscordUnifiedIndexer

Indexes levels from Discord channels.

```typescript
import { DiscordUnifiedIndexer } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(channelUrls: string[], outputDir: string)
```

**Parameters:**
- `channelUrls`: Array of Discord channel URLs
- `outputDir`: Output directory path

#### Methods

##### index()
```typescript
async index(): Promise<Level[]>
```
Indexes all specified Discord channels.

##### setAuthOptions()
```typescript
setAuthOptions(options: { token?: string; tokenFile?: string }): void
```
Sets authentication options.

### HognoseIndexer

Indexes levels from the Hognose GitHub repository.

```typescript
import { HognoseIndexer } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(githubRepo: string, outputDir: string)
```

**Parameters:**
- `githubRepo`: GitHub repository (e.g., 'charredUtensil/hognose')
- `outputDir`: Output directory path

#### Methods

##### index()
```typescript
async index(): Promise<Level[]>
```
Indexes all releases from the repository.

## Authentication

### DiscordAuth

Handles Discord authentication flow.

```typescript
import { DiscordAuth } from 'manic-miners-level-indexer';
```

#### Constructor

```typescript
constructor(cacheDir?: string)
```

**Parameters:**
- `cacheDir`: Directory for token cache (default: './output/.auth')

#### Methods

##### getToken()
```typescript
async getToken(options?: { token?: string; tokenFile?: string }): Promise<AuthResult>
```
Obtains a Discord authentication token.

**Returns:**
```typescript
interface AuthResult {
  token: string;
  userId?: string;
  username?: string;
  expiresAt?: Date;
}
```

##### clearCache()
```typescript
async clearCache(): Promise<void>
```
Clears cached authentication data.

### DiscordTokenProvider

Provides Discord tokens from various sources.

```typescript
import { DiscordTokenProvider } from 'manic-miners-level-indexer';
```

#### Static Methods

##### getToken()
```typescript
static async getToken(options?: { token?: string; tokenFile?: string }): Promise<string | null>
```
Retrieves a token from available sources.

##### validateToken()
```typescript
static async validateToken(token: string): Promise<boolean>
```
Validates a Discord token.

## Types and Interfaces

### Core Types

```typescript
export enum MapSource {
  ARCHIVE = 'archive',
  DISCORD = 'discord',
  HOGNOSE = 'hognose',
}

export interface LevelMetadata {
  id: string;
  title: string;
  author: string;
  description?: string;
  postedDate: Date;
  source: MapSource;
  sourceUrl?: string;
  originalId?: string;
  fileSize?: number;
  requirements?: string[];
  objectives?: string[];
  tags?: string[];
  difficulty?: number;
  rating?: number;
  downloadCount?: number;
  formatVersion?: 'below-v1' | 'v1' | 'v2' | 'unknown';
}

export interface LevelFile {
  filename: string;
  path: string;
  size: number;
  hash?: string;
  type: 'dat' | 'image' | 'thumbnail' | 'other';
}

export interface Level {
  metadata: LevelMetadata;
  files: LevelFile[];
  catalogPath: string;
  datFilePath: string;
  indexed: Date;
  lastUpdated: Date;
}

export interface IndexerConfig {
  outputDir: string;
  sources: {
    archive: ArchiveConfig & { enabled: boolean };
    discord: DiscordConfig & { enabled: boolean };
    hognose: HognoseConfig & { enabled: boolean };
  };
}

export interface IndexerProgress {
  phase: 'scraping' | 'downloading' | 'cataloging' | 'indexing';
  source: MapSource;
  current: number;
  total: number;
  message: string;
}
```

## Utilities

### Logger

Logging utility used throughout the system.

```typescript
import { logger } from 'manic-miners-level-indexer';

logger.info('Information message');
logger.warn('Warning message');
logger.error('Error message');
logger.debug('Debug message');
logger.success('Success message');
```

### FileUtils

File operation utilities.

```typescript
import { FileUtils } from 'manic-miners-level-indexer/utils';

// Ensure directory exists
await FileUtils.ensureDir('./path/to/dir');

// Create temporary directory
const tempDir = await FileUtils.createTempDir();

// Safe file operations
await FileUtils.safeWriteJson('./file.json', data);
const content = await FileUtils.safeReadJson('./file.json');
```

## Complete Usage Example

```typescript
import { 
  MasterIndexer, 
  CatalogManager,
  IndexerConfig,
  MapSource,
  logger 
} from 'manic-miners-level-indexer';

async function main() {
  // Configure the indexer
  const config: IndexerConfig = {
    outputDir: './my-levels',
    sources: {
      archive: {
        enabled: true,
        searchQueries: ['manic miners level'],
        maxConcurrentDownloads: 3
      },
      discord: {
        enabled: true,
        channels: [
          '683985075704299520',
          '1139908458968252457'
        ]
      },
      hognose: {
        enabled: true,
        githubRepo: 'charredUtensil/hognose'
      }
    }
  };

  // Create indexer instance
  const indexer = new MasterIndexer(config);

  // Set up progress tracking
  indexer.on('progress', (progress) => {
    logger.info(`${progress.source}: ${progress.current}/${progress.total} - ${progress.message}`);
  });

  try {
    // Run indexing
    await indexer.indexAll();

    // Get statistics
    const stats = await indexer.getCatalogStats();
    logger.success(`Indexed ${stats.totalLevels} levels`);

    // Export catalog
    const exportPath = await indexer.exportCatalog('json');
    logger.info(`Catalog exported to: ${exportPath}`);

    // Use catalog manager for queries
    const catalog = new CatalogManager(config.outputDir);
    
    // Search for specific levels
    const results = await catalog.searchLevels({
      author: 'Baraklava',
      tags: ['puzzle']
    });
    
    logger.info(`Found ${results.length} puzzle levels by Baraklava`);

  } catch (error) {
    logger.error('Indexing failed:', error);
    process.exit(1);
  }
}

main();
```

## Error Handling

All methods may throw errors that should be handled:

```typescript
try {
  await indexer.indexAll();
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Output directory not found');
  } else if (error.code === 'EACCES') {
    console.error('Permission denied');
  } else if (error.message.includes('Discord')) {
    console.error('Discord authentication failed');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

```typescript
import type {
  Level,
  LevelMetadata,
  IndexerConfig,
  IndexerProgress,
  MapSource
} from 'manic-miners-level-indexer';
```