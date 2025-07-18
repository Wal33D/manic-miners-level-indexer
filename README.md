# Manic Miners Level Indexer

[![CI](https://github.com/Wal33D/manic-miners-level-indexer/actions/workflows/ci.yml/badge.svg)](https://github.com/Wal33D/manic-miners-level-indexer/actions/workflows/ci.yml)
[![Code Quality](https://github.com/Wal33D/manic-miners-level-indexer/actions/workflows/code-quality.yml/badge.svg)](https://github.com/Wal33D/manic-miners-level-indexer/actions/workflows/code-quality.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
[![GitHub](https://img.shields.io/badge/GitHub-Wal33D%2Fmanic--miners--level--indexer-blue)](https://github.com/Wal33D/manic-miners-level-indexer)

A unified indexing system for Manic Miners levels that combines archive scraping, Hognose indexing, and catalog management into a single, powerful tool.

## Features

- **Multi-Source Indexing**: Automatically scrapes and indexes levels from:
  - Internet Archive collections
  - Discord community channels
  - Hognose GitHub releases
- **Catalog Management**: Organizes levels with searchable metadata
- **Master Index**: Creates searchable indexes for efficient level discovery
- **Script-based Operations**: Simple npm scripts for all indexing operations

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Configuration

1. Copy the example configuration:
```bash
cp config.template.json config.json
```

2. Edit `config.json` to customize your settings:
- `outputDir`: Where indexed levels will be stored (default: `./data`)
- `tempDir`: Temporary directory for processing (default: `./temp`)
- Discord channels: Update with your target forum channels
- Archive settings: Adjust search parameters as needed

### Basic Usage

Using npm scripts:
```bash
# Index from all enabled sources
npm run index

# Index from specific sources
npm run index:archive    # Run Internet Archive indexer
npm run index:discord    # Run Discord indexer
npm run index:hognose    # Run Hognose indexer

# Test scripts for individual indexers
npm run test:discord     # Test Discord indexer
npm run test:hognose     # Test Hognose indexer
npm run test:all         # Test all indexers together
npm run verify:hognose   # Verify complete Hognose indexing
```

## Project Links

- **Repository**: [https://github.com/Wal33D/manic-miners-level-indexer](https://github.com/Wal33D/manic-miners-level-indexer)
- **Issues**: [https://github.com/Wal33D/manic-miners-level-indexer/issues](https://github.com/Wal33D/manic-miners-level-indexer/issues)
- **Pull Requests**: [https://github.com/Wal33D/manic-miners-level-indexer/pulls](https://github.com/Wal33D/manic-miners-level-indexer/pulls)

## Architecture

### Core Components

- **Indexers**: Scrape and process levels from different sources
- **Catalog Manager**: Organizes and manages level metadata
- **Master Indexer**: Coordinates all operations and builds searchable indexes
- **Scripts**: Dedicated scripts for each indexing operation

### Data Flow

1. **Scraping**: Indexers collect level data from various sources
2. **Processing**: .dat files are downloaded and processed
3. **Cataloging**: Metadata is organized and stored
4. **Indexing**: Master index is built for efficient searching

## Configuration

The system uses a JSON configuration file with the following structure:

```json
{
  "outputDir": "./data",
  "tempDir": "./temp",
  "sources": {
    "archive": {
      "enabled": true,
      "baseUrl": "https://archive.org/advancedsearch.php"
    },
    "discord": {
      "enabled": true,
      "channels": ["https://discord.com/channels/..."]
    },
    "hognose": {
      "enabled": true,
      "githubRepo": "charredUtensil/hognose",
      "checkInterval": 86400000
    }
  }
}
```

## Discord Integration

The Discord indexer uses Playwright for improved reliability:

- Opens a browser window for manual login
- Waits for user authentication
- Scrapes channels for .dat file attachments
- Processes and catalogs found levels

## Development

### Setup

```bash
npm install
npm run dev
```

### Testing

```bash
npm test
npm run test:coverage
```

### Linting and Formatting

```bash
npm run lint
npm run format
```

### Building

```bash
npm run build
npm start
```

## Available Scripts

### Indexing Scripts

- `npm run index` - Index all levels from all enabled sources
- `npm run index:archive` - Index from Internet Archive only
- `npm run index:discord` - Index from Discord only
- `npm run index:hognose` - Index from Hognose GitHub releases only

### Testing Scripts

- `npm run test` - Run unit tests
- `npm run test:discord` - Test Discord indexer integration
- `npm run test:hognose` - Test Hognose indexer integration
- `npm run test:all` - Test all indexers together
- `npm run verify:hognose` - Verify complete Hognose indexing (all 256 levels)

### Development Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Run in development mode
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Output Structure

```
data/
├── levels-discord/
│   ├── {level-id}/
│   │   ├── catalog.json
│   │   └── {level-name}.dat
│   └── ...
├── levels-archive/
│   ├── {level-id}/
│   │   ├── catalog.json
│   │   └── {level-name}.dat
│   └── ...
├── levels-hognose/
│   ├── {level-id}/
│   │   ├── catalog.json
│   │   └── {level-name}.dat
│   └── ...
├── catalog_index.json
├── catalog_export.json
├── catalog_export.csv
├── master_index.json
├── discord_direct_processed.json
└── discord_processed_hashes.json

test-output/              # Test directory structure
├── temp/                 # Temporary test files
│   ├── config-tests/
│   └── file-utils-tests/
└── integration/          # Integration test outputs
    ├── all-indexers/
    ├── discord/
    ├── hognose/
    └── hognose-verification/
```

## Catalog System

### Understanding the Catalog System

The indexer uses a two-tier catalog system:

1. **Individual Level Catalogs**: Each indexed level has its own `catalog.json` file in its directory
2. **Master Catalog Index**: A central index file (`catalog_index.json`) that tracks all levels

### Important: Rebuilding the Catalog Index

When using individual indexers directly, they only create individual level catalogs. The master catalog index is NOT automatically updated.

#### Using Individual Indexers

After running an individual indexer, you must rebuild the catalog index:

```typescript
import { HognoseIndexer } from './src/indexers/hognoseIndexer';
import { CatalogManager } from './src/catalog/catalogManager';

// Run the indexer
const indexer = new HognoseIndexer('charredUtensil/hognose', './data');
await indexer.indexHognose();

// IMPORTANT: Rebuild the catalog index
const catalogManager = new CatalogManager('./data');
await catalogManager.rebuildCatalogIndex();

// Now you can access all levels
const allLevels = await catalogManager.getAllLevels();
console.log(`Total levels: ${allLevels.length}`); // Should show 256 for Hognose
```

#### Using the Master Indexer

The MasterIndexer automatically rebuilds the catalog index after all indexing is complete:

```typescript
import { MasterIndexer } from './src/catalog/masterIndexer';

const masterIndexer = new MasterIndexer(config);
await masterIndexer.indexAll(); // Automatically rebuilds catalog index
```

### Accessing Indexed Levels

Once the catalog index is built, you can access levels using CatalogManager:

```typescript
const catalogManager = new CatalogManager('./data');
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

### Common Catalog Issues

#### "Only seeing 50 levels"
If you're only seeing a limited number of levels, you're likely using `getRecentLevels()` which has a default limit. Use `getAllLevels()` to access all indexed levels.

#### "0 levels in catalog after indexing"
This happens when the catalog index hasn't been rebuilt. Always call `rebuildCatalogIndex()` after using individual indexers.

#### "256 levels processed but catalog shows less"
Check if previous indexing sessions created a `hognose_processed.json` file. The indexer skips already-processed releases. Delete this file to re-index all releases.

## Hognose Release Management

The HognoseIndexer includes smart release management:

### Default Behavior
- Only processes the latest release (not all historical releases)
- Automatically detects new releases and clears old levels
- Maintains only the most current set of 256 levels

### Hognose Options

```typescript
const indexer = new HognoseIndexer('charredUtensil/hognose', './data');

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
const catalogManager = new CatalogManager('./data');
await catalogManager.loadCatalogIndex();

// Clear all Hognose levels
const cleared = await catalogManager.clearLevelsBySource(MapSource.HOGNOSE);
console.log(`Cleared ${cleared} Hognose levels`);
```

This ensures your catalog always contains the latest Hognose levels without accumulating outdated versions.

## Git Workflow

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Wal33D/manic-miners-level-indexer.git
   cd manic-miners-level-indexer
   npm install
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or for bugfixes:
   git checkout -b fix/your-bugfix-name
   ```

### Before Committing

Always run these checks before committing:

```bash
# 1. TypeScript type checking
npm run type-check

# 2. Lint and fix code issues
npm run lint

# 3. Format code with Prettier
npm run format

# 4. Run tests (if applicable)
npm test
```

### Commit Guidelines

1. **Write clear commit messages**:
   ```bash
   # Good examples:
   git commit -m "Add Discord channel validation"
   git commit -m "Fix memory leak in archive indexer"
   git commit -m "Update TypeScript to 5.0"
   
   # Bad examples:
   git commit -m "Fixed stuff"
   git commit -m "Updates"
   ```

2. **Keep commits focused**: One feature/fix per commit

3. **Reference issues when applicable**:
   ```bash
   git commit -m "Fix duplicate level detection (#123)"
   ```

### Pushing Changes

```bash
# Push your feature branch
git push origin feature/your-feature-name

# Create a pull request on GitHub
```

### Keeping Your Fork Updated

```bash
# Add the upstream remote (only need to do this once)
git remote add upstream https://github.com/Wal33D/manic-miners-level-indexer.git

# Fetch and merge updates from upstream
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

### Pull Request Process

1. **Ensure all checks pass** (type-check, lint, format)
2. **Update documentation** if you've changed APIs
3. **Add tests** for new features
4. **Request review** from maintainers
5. **Address feedback** promptly

## Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository** and create your branch from `main`
2. **Follow the coding style** - TypeScript, ESLint, and Prettier configs are provided
3. **Write tests** for new features when possible
4. **Update documentation** as needed
5. **Submit a pull request** with a clear description of changes

### Code Style

- Use TypeScript for all new code
- Follow the existing code patterns and conventions
- Keep functions small and focused
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

### Testing

- Unit tests go in `src/tests/`
- Integration tests go in `tests/integration/`
- Run `npm test` to execute all tests
- Add tests for bug fixes to prevent regressions

## License

MIT License - see LICENSE file for details