# API Reference

## Quick Start

```typescript
import { MasterIndexer } from 'manic-miners-level-indexer';

const indexer = new MasterIndexer(config);
await indexer.indexAll();
```

## Core Classes

### MasterIndexer

The main class for indexing levels from all sources.

#### Constructor
```typescript
constructor(config: IndexerConfig)
```

See [Configuration Guide](CONFIGURATION.md) for detailed config options.

#### Methods

##### indexAll()
Index levels from all enabled sources.
```typescript
async indexAll(): Promise<void>
```

##### indexSource()
Index levels from a specific source.
```typescript
async indexSource(source: MapSource): Promise<void>
```

##### exportCatalog()
Export the catalog in different formats.
```typescript
async exportCatalog(format: 'json' | 'csv'): Promise<string>
```

##### getCatalogStats()
Get statistics about the indexed catalog.
```typescript
async getCatalogStats(): Promise<CatalogStats>
```

### CatalogManager

Manages the level catalog and provides search capabilities.

#### Methods

##### loadCatalogIndex()
Load the catalog from disk.
```typescript
async loadCatalogIndex(): Promise<void>
```

##### searchLevels()
Search for levels with filters.
```typescript
searchLevels(filters?: LevelFilter): Level[]
```

##### searchByAuthor()
Find all levels by a specific author.
```typescript
searchByAuthor(author: string): Level[]
```

##### searchByTags()
Find levels with specific tags.
```typescript
searchByTags(tags: string[]): Level[]
```

## Data Types

### Level
```typescript
interface Level {
  metadata: LevelMetadata;
  files: LevelFile[];
  catalogPath: string;
  datFilePath: string;
  indexed: Date;
  lastUpdated: Date;
}
```

### LevelMetadata
```typescript
interface LevelMetadata {
  id: string;
  title: string;
  author: string;
  description?: string;
  postedDate: Date;
  source: MapSource;
  sourceUrl?: string;
  originalId?: string;
  tags?: string[];
  formatVersion?: string;
}
```

### MapSource
```typescript
enum MapSource {
  INTERNET_ARCHIVE = 'internet_archive',
  DISCORD_COMMUNITY = 'discord_community',
  DISCORD_ARCHIVE = 'discord_archive',
  HOGNOSE = 'hognose'
}
```

### CatalogStats
```typescript
interface CatalogStats {
  totalLevels: number;
  bySource: Record<MapSource, number>;
  byAuthor: Record<string, number>;
  byFormatVersion: Record<string, number>;
  totalSize: number;
  lastUpdated: Date;
}
```

## Events

The MasterIndexer emits progress events during indexing:

```typescript
indexer.on('progress', (progress: IndexerProgress) => {
  console.log(`${progress.source}: ${progress.current}/${progress.total}`);
});

indexer.on('error', (error: Error, source: MapSource) => {
  console.error(`Error in ${source}:`, error);
});

indexer.on('complete', (source: MapSource, result: IndexerResult) => {
  console.log(`${source} complete: ${result.levelsProcessed} levels`);
});
```

## Error Handling

All methods that interact with external services may throw errors:

```typescript
try {
  await indexer.indexAll();
} catch (error) {
  if (error instanceof NetworkError) {
    // Handle network issues
  } else if (error instanceof AuthenticationError) {
    // Handle auth issues
  }
}
```

## Examples

### Basic Usage
```typescript
import { MasterIndexer } from 'manic-miners-level-indexer';

const config = {
  outputDir: './output',
  sources: {
    internet_archive: { enabled: true },
    discord_community: { enabled: true },
    discord_archive: { enabled: true },
    hognose: { enabled: true }
  }
};

const indexer = new MasterIndexer(config);
await indexer.indexAll();
```

### Search Example
```typescript
import { CatalogManager } from 'manic-miners-level-indexer';

const catalog = new CatalogManager('./output');
await catalog.loadCatalogIndex();

// Find levels by author
const levels = catalog.searchByAuthor('Hognose');

// Search with multiple filters
const filtered = catalog.searchLevels({
  author: 'crystal2780',
  source: MapSource.DISCORD_COMMUNITY,
  tags: ['puzzle']
});
```

### Progress Monitoring
```typescript
const indexer = new MasterIndexer(config);

indexer.on('progress', ({ source, current, total, message }) => {
  const percent = Math.round((current / total) * 100);
  console.log(`[${source}] ${percent}% - ${message}`);
});

await indexer.indexAll();
```

For detailed configuration options, see the [Configuration Guide](CONFIGURATION.md).