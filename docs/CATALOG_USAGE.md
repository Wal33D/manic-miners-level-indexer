# Catalog Usage Guide

## Understanding the Catalog System

The Manic Miners Level Indexer uses a two-tier catalog system:

1. **Individual Level Catalogs**: Each indexed level has its own `catalog.json` file in its directory
2. **Master Catalog Index**: A central index file (`catalog_index.json`) that tracks all levels

## Important: Rebuilding the Catalog Index

When using individual indexers (HognoseIndexer, DiscordIndexer, ArchiveIndexer) directly, they only create individual level catalogs. The master catalog index is NOT automatically updated.

### Using Individual Indexers

After running an individual indexer, you must rebuild the catalog index:

```typescript
import { HognoseIndexer } from './src/indexers/hognoseIndexer';
import { CatalogManager } from './src/catalog/catalogManager';

// Run the indexer
const indexer = new HognoseIndexer('charredUtensil/hognose', './output');
await indexer.indexHognose();

// IMPORTANT: Rebuild the catalog index
const catalogManager = new CatalogManager('./output');
await catalogManager.rebuildCatalogIndex();

// Now you can access all levels
const allLevels = await catalogManager.getAllLevels();
console.log(`Total levels: ${allLevels.length}`); // Should show 256 for Hognose
```

### Using the Master Indexer

The MasterIndexer automatically rebuilds the catalog index after all indexing is complete:

```typescript
import { MasterIndexer } from './src/catalog/masterIndexer';

const masterIndexer = new MasterIndexer(config);
await masterIndexer.indexAll(); // Automatically rebuilds catalog index
```

## Accessing Indexed Levels

Once the catalog index is built, you can access levels using CatalogManager:

```typescript
const catalogManager = new CatalogManager('./output');
await catalogManager.loadCatalogIndex();

// Get all levels
const allLevels = await catalogManager.getAllLevels();

// Get levels by source
const hognoseLevels = await catalogManager.getLevelsBySource(MapSource.HOGNOSE);
const discordLevels = await catalogManager.getLevelsBySource(MapSource.DISCORD);
const archiveLevels = await catalogManager.getLevelsBySource(MapSource.ARCHIVE);

// Get recent levels (limited)
const recentLevels = await catalogManager.getRecentLevels(50);
```

## Why This Design?

This two-tier system allows for:
- Incremental indexing without rebuilding the entire catalog
- Individual level metadata that can be accessed independently
- A central index for fast queries across all levels
- Support for multiple indexing sessions without data loss

## Common Issues

### "Only seeing 50 levels"
If you're only seeing a limited number of levels, you're likely using `getRecentLevels()` which has a default limit. Use `getAllLevels()` to access all indexed levels.

### "0 levels in catalog after indexing"
This happens when the catalog index hasn't been rebuilt. Always call `rebuildCatalogIndex()` after using individual indexers.

### "256 levels processed but catalog shows less"
Check if previous indexing sessions created a `hognose_processed.json` file. The indexer skips already-processed releases. Delete this file to re-index all releases.

## Hognose Release Management

The HognoseIndexer now includes smart release management:

### Default Behavior
- Only processes the latest release (not all historical releases)
- Automatically detects new releases and clears old levels
- Maintains only the most current set of 256 levels

### Options

```typescript
const indexer = new HognoseIndexer('charredUtensil/hognose', './output');

// Default: Process latest release only, auto-replace on new release
await indexer.indexHognose();

// Process all releases (historical)
await indexer.indexHognose(undefined, { latestOnly: false });

// Force replace all existing levels
await indexer.indexHognose(undefined, { replaceExisting: true });

// Prevent auto-replacement on new release
await indexer.indexHognose(undefined, { replaceExisting: false });
```

### Clearing Levels by Source

You can manually clear all levels from a specific source:

```typescript
const catalogManager = new CatalogManager('./output');
await catalogManager.loadCatalogIndex();

// Clear all Hognose levels
const cleared = await catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
console.log(`Cleared ${cleared} Hognose levels`);
```

This ensures your catalog always contains the latest Hognose levels without accumulating outdated versions.