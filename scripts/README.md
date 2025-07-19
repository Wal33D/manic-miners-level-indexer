# Scripts Directory

This directory contains various scripts for running and managing the Manic Miners Level Indexer.

## Main Scripts (Production)

- **index-all.ts** - Run all indexers (Internet Archive, Discord, Hognose)
- **index-internet-archive.ts** - Index levels from Internet Archive only
- **index-discord-community.ts** - Index levels from Discord Community forum channel
- **index-discord-archive.ts** - Index levels from Discord Archive channel
- **index-hognose.ts** - Index levels from Hognose GitHub releases only

## test/ Directory (Development/Testing)

Contains test scripts for validating individual components:
- Discord authentication tests
- Discord API pagination tests
- Image download tests
- Small-scale indexing tests

## utils/ Directory (Utilities)

Contains utility and analysis scripts:
- **analyze-dat-format.ts** - Analyze DAT file format versions
- **build-discord-catalog.ts** - Build Discord catalog from messages
- **check-active-threads.ts** - Check active Discord threads
- **clean-test-outputs.ts** - Clean up test output files
- **count-both-channels.ts** - Count messages in Discord channels
- **count-discord-threads.ts** - Count Discord threads
- **find-rage-road.ts** - Search for specific level
- **rebuild-catalog.ts** - Rebuild the master catalog index
- **show-output-structure.ts** - Display output directory structure
- **validate-full-catalog.ts** - Validate the complete catalog

## Usage

All scripts can be run using:
```bash
npm run script <script-name>
```

Or directly with tsx:
```bash
npx tsx scripts/<script-name>.ts
```

For example:
```bash
# Run all indexers
npm run index

# Run Discord Community indexer
npm run index:discord:community

# Run Discord Archive indexer
npm run index:discord:archive

# Validate the catalog
npx tsx scripts/utils/validate-full-catalog.ts
```