# Scripts Directory

This directory contains various scripts for running and managing the Manic Miners Level Indexer.

## Main Indexing Scripts

- **index-all.ts** - Run all indexers (Internet Archive, Discord Community, Discord Archive, Hognose)
- **index-internet-archive.ts** - Index levels from Internet Archive only
- **index-discord-community.ts** - Index levels from Discord Community forum channel (v1+ maps)
- **index-discord-archive.ts** - Index levels from Discord Archive channel (pre-v1 maps)
- **index-hognose.ts** - Index levels from Hognose GitHub releases only

## Test Scripts

- **run-full-test-suite.ts** - Run the complete test suite for all indexers
- **test/test-discord-auto-login.ts** - Test Discord authentication with session persistence

## Utility Scripts

- **utils/clean-test-outputs.ts** - Clean up test output directories
- **utils/rebuild-catalog.ts** - Rebuild the master catalog index from existing data
- **utils/validate-full-catalog.ts** - Validate the complete catalog for integrity

## Usage

All scripts can be run using npm scripts defined in package.json:

```bash
# Run all indexers
npm run index

# Run individual indexers
npm run index:internet-archive
npm run index:discord:community
npm run index:discord:archive
npm run index:hognose

# Run tests
npm run test:full
npm run test:discord:auth

# Run utilities
npm run clean:test
npm run rebuild:catalog
npm run validate:catalog
```

Or run directly with ts-node:
```bash
npx ts-node scripts/index-all.ts
npx ts-node scripts/utils/validate-full-catalog.ts
```

## Output Structure

All indexers output to the following directory structure:
```
output/
├── levels-internet-archive/  # Internet Archive levels
├── levels-discord-community/ # Discord Community levels (v1+)
├── levels-discord-archive/   # Discord Archive levels (pre-v1)
├── levels-hognose/          # Hognose GitHub releases
├── catalog_index.json       # Individual source catalogs
└── master_index.json        # Combined master catalog
```