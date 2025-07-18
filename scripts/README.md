# Scripts Directory

This directory contains various scripts for running and managing the Manic Miners Level Indexer.

## Main Scripts (Production)

- **index-all.ts** - Run all indexers (Archive.org, Discord, Hognose)
- **index-archive.ts** - Index levels from Archive.org only
- **index-discord.ts** - Index levels from Discord channels only
- **index-discord-unified.ts** - Index Discord using the unified indexer
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
npm run index-all

# Run only Discord indexer
npm run index-discord

# Validate the catalog
npx tsx scripts/utils/validate-full-catalog.ts
```