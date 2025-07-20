# Indexers Guide

Detailed documentation for each indexer in the Manic Miners Level Indexer system, including configuration, features, and usage examples.

## Table of Contents

1. [Overview](#overview)
2. [Archive.org Indexer](#archiveorg-indexer)
3. [Discord Indexer](#discord-indexer)
4. [Hognose Indexer](#hognose-indexer)
5. [Common Features](#common-features)
6. [Performance Tuning](#performance-tuning)

## Overview

The Manic Miners Level Indexer supports three distinct sources for level collection, each with its own specialized indexer:

| Source | Type | Authentication | Format Versions | Update Frequency |
|--------|------|----------------|-----------------|------------------|
| Archive.org | Public Archive | None | below-v1, v1 | As uploaded |
| Discord | Community Forum | User Token | below-v1, v1 | Real-time |
| Hognose | GitHub Releases | None | v1, v2 | Per release |

## Archive.org Indexer

The Internet Archive indexer searches and downloads Manic Miners levels from Archive.org's vast digital library.

### Features

- **Advanced Search**: Customizable search queries with date filtering
- **Streaming Metadata**: Efficient metadata fetching without loading full pages
- **Concurrent Downloads**: Parallel file downloads with configurable limits
- **Resume Support**: Persistent state for interrupted indexing sessions
- **Bandwidth Management**: Optional bandwidth limiting for downloads
- **Checksum Verification**: Optional file integrity checking

### Configuration

```json
{
  "archive": {
    "enabled": true,
    "baseUrl": "https://archive.org/advancedsearch.php",
    "searchQueries": [
      "manic miners level",
      "manic miners map",
      "manic miners custom"
    ],
    "dateRange": {
      "from": "2020-01-01",
      "to": "2024-12-31"
    },
    "maxConcurrentMetadata": 10,
    "maxConcurrentDownloads": 5,
    "retryAttempts": 3,
    "downloadTimeout": 60000,
    "bandwidthLimit": 1048576,
    "skipExisting": true,
    "verifyChecksums": false
  }
}
```

### Configuration Options

- **searchQueries**: Array of search terms (combined with OR)
- **dateRange**: Filter results by upload date
- **maxConcurrentMetadata**: Parallel metadata fetches (default: 10)
- **maxConcurrentDownloads**: Parallel file downloads (default: 5)
- **retryAttempts**: Retry count for failed downloads (default: 3) with exponential backoff
- **downloadTimeout**: Download timeout in milliseconds (default: 60s)
- **bandwidthLimit**: Bytes per second limit (optional)
- **skipExisting**: Skip already indexed items (default: true)
- **verifyChecksums**: Verify file checksums after download

### Usage Example

```typescript
import { InternetArchiveIndexer } from 'manic-miners-level-indexer';

const config = {
  baseUrl: 'https://archive.org/advancedsearch.php',
  searchQueries: ['manic miners'],
  maxConcurrentDownloads: 3
};

const indexer = new InternetArchiveIndexer(config, './output');

// Set progress callback
indexer.setProgressCallback((progress) => {
  console.log(`${progress.current}/${progress.total}: ${progress.message}`);
});

// Run indexing
const levels = await indexer.index();
console.log(`Indexed ${levels.length} levels from Archive.org`);
```

### Output Structure

```
levels-archive/
├── catalog_index.json
└── 550e8400-e29b-41d4-a716-446655440000/
    ├── catalog.json
    ├── level.dat
    └── screenshot.jpg
```

### Metadata Captured

- Title and description from item metadata
- Author information (uploader)
- Upload date and modification date
- File size and format
- Download count from Archive.org
- Original item identifier
- Collection information

## Discord Indexer

The Discord indexer extracts levels shared in Discord forum channels and threads.

### Features

- **Forum Thread Support**: Indexes both channels and forum threads
- **Automated Authentication**: Browser automation with token caching
- **Thread Discovery**: Finds both active and archived threads
- **Attachment Processing**: Downloads .dat files from messages
- **Metadata Extraction**: Parses level information from messages
- **Pagination Handling**: Processes all messages in long threads

### Configuration

```json
{
  "discord_community": {
    "enabled": true,
    "channels": [
      "1139908458968252457"
    ],
    "excludedThreads": ["thread_id"],
    "retryAttempts": 3,
    "downloadTimeout": 60000
  },
  "discord_archive": {
    "enabled": true,
    "channels": [
      "683985075704299520"
    ],
    "retryAttempts": 3,
    "downloadTimeout": 60000
  }
}
```

### Configuration Options

- **channels**: Array of channel IDs to index
- **excludedThreads**: Array of thread IDs to skip (optional)
- **retryAttempts**: Retry count for failed API calls and downloads (default: 3) with exponential backoff
- **downloadTimeout**: Download timeout in milliseconds (default: 60000ms)

### Authentication Setup

Discord requires user authentication. See [Discord Authentication Guide](DISCORD_AUTHENTICATION.md) for detailed setup.

Quick setup:
```bash
# Method 1: Environment variable
export DISCORD_TOKEN="your_discord_token"

# Method 2: .env file
echo "DISCORD_TOKEN=your_discord_token" > .env

# Method 3: Token file
echo "your_discord_token" > ~/.discord-token
```

### Usage Example

```typescript
import { DiscordUnifiedIndexer } from 'manic-miners-level-indexer';

const channels = [
  'https://discord.com/channels/580269696369164299/683985075704299520',
  'https://discord.com/channels/580269696369164299/1139908458968252457'
];

const indexer = new DiscordUnifiedIndexer(channels, './output');

// Set authentication options
indexer.setAuthOptions({
  token: process.env.DISCORD_TOKEN
});

// Run indexing
const levels = await indexer.index();
console.log(`Indexed ${levels.length} levels from Discord`);
```

### Thread Types Supported

1. **Regular Channels**: Standard Discord channels
2. **Forum Channels**: Channels with thread-based organization
3. **Archived Threads**: Inactive threads (still accessible)
4. **Active Threads**: Currently active discussions

### Output Structure

```
levels-discord/
├── catalog_index.json
└── a7c2f8d1-3e5b-4912-8f3a-987654321098/
    ├── catalog.json
    ├── AncientCave.dat
    └── preview.png
```

### Metadata Captured

- Level title (from filename or message)
- Author (Discord username)
- Post date and thread information
- Message content as description
- Thread URL as source
- File size and format detection
- Tags extracted from message

## Hognose Indexer

The Hognose indexer downloads procedurally generated levels from the Hognose GitHub repository.

### Features

- **GitHub Releases API**: Fetches all repository releases
- **In-Memory Processing**: Extracts ZIP files without temp directories
- **Batch Processing**: Handles multiple levels per release
- **Version Detection**: Identifies format versions from metadata
- **Release Notes**: Extracts changelog information

### Configuration

```json
{
  "hognose": {
    "enabled": true,
    "githubRepo": "charredUtensil/hognose",
    "retryAttempts": 3,
    "downloadTimeout": 60000,
    "verifyChecksums": true
  }
}
```

### Configuration Options

- **githubRepo**: GitHub repository path (owner/repo)
- **retryAttempts**: Retry count for failed API calls and downloads (default: 3) with exponential backoff
- **downloadTimeout**: Download timeout in milliseconds (default: 60000ms)
- **verifyChecksums**: Calculate and log SHA-256 checksums for downloaded ZIP files (default: false)

### Usage Example

```typescript
import { HognoseIndexer } from 'manic-miners-level-indexer';

const indexer = new HognoseIndexer('charredUtensil/hognose', './output');

// Set progress callback
indexer.setProgressCallback((progress) => {
  console.log(`Processing release: ${progress.message}`);
});

// Run indexing
const levels = await indexer.index();
console.log(`Indexed ${levels.length} levels from Hognose`);
```

### Release Processing

1. Fetches all releases via GitHub API
2. Downloads ZIP files for each release
3. Extracts levels in memory
4. Processes each .dat file
5. Generates metadata from release info

### Output Structure

```
levels-hognose/
├── catalog_index.json
└── release-v0.11.2/
    ├── groundhog-0001/
    │   ├── catalog.json
    │   └── level.dat
    ├── groundhog-0002/
    │   ├── catalog.json
    │   └── level.dat
    └── ...
```

### Metadata Captured

- Level title from filename
- Author (typically "groundhog" or "hognose")
- Release date and version
- GitHub release URL
- File size and format version
- Release notes excerpt
- Procedural generation seed (if available)

## Common Features

### Progress Tracking

All indexers support progress callbacks:

```typescript
indexer.setProgressCallback((progress: IndexerProgress) => {
  console.log(`[${progress.phase}] ${progress.source}: ${progress.current}/${progress.total}`);
  console.log(progress.message);
});
```

Progress phases:
- `scraping`: Discovering levels to index
- `downloading`: Downloading level files
- `cataloging`: Creating catalog entries
- `indexing`: Processing and validation

### Error Handling

All indexers implement robust error handling:

```typescript
try {
  await indexer.index();
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    console.log('Rate limited, try again later');
  } else if (error.code === 'AUTH_FAILED') {
    console.log('Authentication failed');
  } else {
    console.log('Indexing error:', error.message);
  }
}
```

### State Persistence

Archive and Discord indexers support resume capability:

```typescript
// Indexing will resume from last successful item
const indexer = new InternetArchiveIndexer(config, './output');
await indexer.index(); // Resumes if interrupted
```

### Format Detection

All indexers use intelligent format detection:

```typescript
// Automatic detection based on source and file analysis
formatVersion: 'below-v1' | 'v1' | 'v2' | 'unknown'
```

Detection logic:
- **Archive.org**: Usually below-v1 format
- **Discord**: Mixed below-v1 and v1
- **Hognose**: v1 and v2 formats
- File size/structure analysis for confirmation

## Performance Tuning

### Archive.org Optimization

```json
{
  "archive": {
    "maxConcurrentMetadata": 20,      // Increase for faster discovery
    "maxConcurrentDownloads": 10,    // Balance with bandwidth
    "bandwidthLimit": 5242880        // 5MB/s limit
  }
}
```

### Discord Optimization

```json
{
  "discord": {
    "channels": [/* limit active channels */],
    // Process channels sequentially to avoid rate limits
  }
}
```

### Hognose Optimization

```json
{
  "hognose": {
    // Generally fast, no tuning needed
  }
}
```

### General Tips

1. **Storage**: Use SSD for better I/O performance
2. **Network**: Ensure stable connection for large downloads
3. **Memory**: 4GB+ RAM recommended for large indexing runs
4. **Scheduling**: Run during off-peak hours for better speeds

## Troubleshooting

### Archive.org Issues

**Problem**: Slow metadata fetching
```bash
# Increase concurrent fetches
"maxConcurrentMetadata": 20
```

**Problem**: Downloads failing
```bash
# Increase timeout and retries
"downloadTimeout": 120000,
"retryAttempts": 5
```

### Discord Issues

**Problem**: Authentication failures
```bash
# Check token validity
npm run test:discord:auth
```

**Problem**: Missing threads
```bash
# Discord may have permission restrictions
# Ensure your account can view archived threads
```

### Hognose Issues

**Problem**: GitHub API rate limit
```bash
# Authenticated requests have higher limits
export GITHUB_TOKEN="your_github_token"
```

## Advanced Usage

### Custom Search Queries

```typescript
// Archive.org advanced search
const config = {
  searchQueries: [
    'manic miners level AND creator:"Baraklava"',
    'manic miners map AND year:[2023 TO 2024]'
  ]
};
```

### Selective Channel Indexing

```typescript
// Index specific Discord threads
const channels = [
  'https://discord.com/channels/.../thread-id-1',
  'https://discord.com/channels/.../thread-id-2'
];
```

### Custom Output Processing

```typescript
// Post-process indexed levels
indexer.on('levelIndexed', (level: Level) => {
  // Custom processing
  console.log(`Indexed: ${level.metadata.title}`);
});
```