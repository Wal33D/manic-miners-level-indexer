# Configuration Reference

Complete reference for all configuration options in the Manic Miners Level Indexer.

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Configuration File](#configuration-file)
3. [Environment Variables](#environment-variables)
4. [Global Options](#global-options)
5. [Archive.org Configuration](#archiveorg-configuration)
6. [Discord Configuration](#discord-configuration)
7. [Hognose Configuration](#hognose-configuration)
8. [Advanced Configuration](#advanced-configuration)
9. [Configuration Examples](#configuration-examples)

## Configuration Overview

The indexer can be configured through multiple methods:

1. **Configuration File**: `config.json` in the project root
2. **Environment Variables**: System or `.env` file
3. **Command Line Arguments**: For script execution
4. **Programmatic API**: Direct object passing

Priority order (highest to lowest):
1. Programmatic configuration
2. Command line arguments
3. Configuration file
4. Environment variables
5. Default values

## Configuration File

### Basic Structure

Create a `config.json` file in the project root:

```json
{
  "outputDir": "./output",
  "sources": {
    "archive": {
      "enabled": true,
      // Archive-specific options
    },
    "discord": {
      "enabled": true,
      // Discord-specific options
    },
    "hognose": {
      "enabled": true,
      // Hognose-specific options
    }
  }
}
```

### Loading Configuration

The indexer automatically loads `config.json` if present:

```typescript
// Automatic loading
const indexer = new MasterIndexer(); // Uses config.json

// Or specify custom config
const indexer = new MasterIndexer(customConfig);
```

## Environment Variables

### Global Variables

```bash
# Output directory
OUTPUT_DIR="./my-levels"

# Enable/disable sources
ENABLE_ARCHIVE="true"
ENABLE_DISCORD="true"
ENABLE_HOGNOSE="true"

# Logging level
LOG_LEVEL="info"  # debug, info, warn, error

# Node.js options
NODE_OPTIONS="--max-old-space-size=4096"
```

### Discord Variables

```bash
# Authentication
DISCORD_TOKEN="your_discord_token"
DISCORD_USER_TOKEN="alternative_token_name"
DISCORD_EMAIL="your_email@example.com"
DISCORD_PASSWORD="your_password"

# Session encryption
DISCORD_SESSION_KEY="encryption_key_for_sessions"
```

### Archive.org Variables

```bash
# API configuration
ARCHIVE_BASE_URL="https://archive.org/advancedsearch.php"
ARCHIVE_SEARCH_QUERIES="manic miners level,manic miners map"
ARCHIVE_MAX_DOWNLOADS="5"
```

### Development Variables

```bash
# Debug mode
DEBUG="*"  # Enable all debug output
DEBUG="discord:*"  # Discord-specific debug
DEBUG="archive:*"  # Archive-specific debug

# Test mode
TEST_MODE="true"  # Limits data for testing
TEST_LIMIT="10"   # Number of items per source
```

## Global Options

### outputDir

**Type**: `string`  
**Default**: `"./output"`  
**Description**: Root directory for all indexed levels and catalogs

```json
{
  "outputDir": "/path/to/custom/output"
}
```

### sources

**Type**: `object`  
**Description**: Configuration for each indexer source

```json
{
  "sources": {
    "archive": { /* ... */ },
    "discord": { /* ... */ },
    "hognose": { /* ... */ }
  }
}
```

## Archive.org Configuration

### Complete Options

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
    "verifyChecksums": false,
    "includeCollections": ["opensource_media"],
    "excludeCollections": ["test_collection"],
    "minFileSize": 1024,
    "maxFileSize": 10485760
  }
}
```

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable this indexer |
| `baseUrl` | string | "https://archive.org/advancedsearch.php" | Archive.org API endpoint |
| `searchQueries` | string[] | ["manic miners level"] | Search terms (OR combined) |
| `dateRange` | object | null | Filter by upload date |
| `maxConcurrentMetadata` | number | 10 | Parallel metadata fetches |
| `maxConcurrentDownloads` | number | 5 | Parallel file downloads |
| `retryAttempts` | number | 3 | Download retry count |
| `downloadTimeout` | number | 60000 | Download timeout (ms) |
| `bandwidthLimit` | number | null | Bytes/second limit |
| `skipExisting` | boolean | true | Skip already indexed files based on hash |
| `verifyChecksums` | boolean | false | Verify file hashes |
| `includeCollections` | string[] | null | Only these collections |
| `excludeCollections` | string[] | null | Skip these collections |
| `minFileSize` | number | null | Minimum file size |
| `maxFileSize` | number | null | Maximum file size |

## Discord Configuration

### Complete Options

```json
{
  "discord": {
    "enabled": true,
    "channels": [
      "683985075704299520",
      "1139908458968252457",
      "https://discord.com/channels/580269696369164299/1139908458968252457"
    ],
    "authMethod": "token",
    "token": null,
    "tokenFile": null,
    "includeArchived": true,
    "messageLimit": 1000,
    "downloadAttachments": true,
    "allowedFileTypes": [".dat"],
    "skipEmptyMessages": true,
    "parseMessageContent": true,
    "retryAttempts": 3,
    "downloadTimeout": 60000,
    "skipExisting": true
  }
}
```

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable this indexer |
| `channels` | string[] | [] | Channel IDs or URLs to index |
| `authMethod` | string | "token" | Auth method: "token", "browser" |
| `token` | string | null | Direct token (overrides env) |
| `tokenFile` | string | null | Path to token file |
| `includeArchived` | boolean | true | Include archived threads |
| `messageLimit` | number | 1000 | Max messages per channel |
| `downloadAttachments` | boolean | true | Download attached files |
| `allowedFileTypes` | string[] | [".dat"] | File extensions to download |
| `skipEmptyMessages` | boolean | true | Skip messages without attachments |
| `parseMessageContent` | boolean | true | Extract metadata from messages |
| `retryAttempts` | number | 3 | Retry count for failed requests |
| `downloadTimeout` | number | 60000 | Download timeout in milliseconds |
| `skipExisting` | boolean | true | Skip already indexed messages and files |

## Hognose Configuration

### Complete Options

```json
{
  "hognose": {
    "enabled": true,
    "githubRepo": "charredUtensil/hognose",
    "includePrerelease": false,
    "downloadAssets": true,
    "assetPatterns": ["*.zip", "*.dat"],
    "extractArchives": true,
    "groupByRelease": true,
    "limitReleases": null,
    "githubToken": null,
    "retryAttempts": 3,
    "downloadTimeout": 60000,
    "verifyChecksums": true,
    "skipExisting": true
  }
}
```

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable this indexer |
| `githubRepo` | string | "charredUtensil/hognose" | GitHub repository path |
| `includePrerelease` | boolean | false | Include pre-release versions |
| `downloadAssets` | boolean | true | Download release assets |
| `assetPatterns` | string[] | ["*.zip"] | Asset filename patterns |
| `extractArchives` | boolean | true | Extract ZIP files |
| `groupByRelease` | boolean | true | Group levels by release |
| `limitReleases` | number | null | Max releases to process |
| `githubToken` | string | null | GitHub API token |
| `retryAttempts` | number | 3 | Retry count for failed requests |
| `downloadTimeout` | number | 60000 | Download timeout in milliseconds |
| `verifyChecksums` | boolean | true | Verify SHA-256 checksums of ZIP files |
| `skipExisting` | boolean | true | Skip already indexed releases and files |

## Advanced Configuration

### Logging Configuration

```json
{
  "logging": {
    "level": "info",
    "file": "./logs/indexer.log",
    "console": true,
    "timestamp": true,
    "colors": true,
    "maxFiles": 5,
    "maxSize": "10m"
  }
}
```

### Performance Tuning

```json
{
  "performance": {
    "maxMemory": 4096,
    "cpuThrottle": 0.8,
    "diskCache": true,
    "cacheSize": "1g",
    "compression": true
  }
}
```

### Network Configuration

```json
{
  "network": {
    "proxy": "http://proxy.example.com:8080",
    "timeout": 30000,
    "retries": 3,
    "retryDelay": 1000,
    "userAgent": "ManicMinersIndexer/1.0"
  }
}
```

## Configuration Examples

### Minimal Configuration

```json
{
  "outputDir": "./levels",
  "sources": {
    "archive": { "enabled": true },
    "discord": { "enabled": false },
    "hognose": { "enabled": true }
  }
}
```

### Development Configuration

```json
{
  "outputDir": "./test-output",
  "sources": {
    "archive": {
      "enabled": true,
      "searchQueries": ["manic miners test"],
      "maxConcurrentDownloads": 1
    },
    "discord": {
      "enabled": true,
      "channels": ["test-channel-id"],
      "messageLimit": 10
    },
    "hognose": {
      "enabled": true,
      "limitReleases": 1
    }
  },
  "logging": {
    "level": "debug"
  }
}
```

### Production Configuration

```json
{
  "outputDir": "/data/manic-miners/levels",
  "sources": {
    "archive": {
      "enabled": true,
      "searchQueries": [
        "manic miners level",
        "manic miners map",
        "manic miners custom"
      ],
      "maxConcurrentMetadata": 20,
      "maxConcurrentDownloads": 10,
      "bandwidthLimit": 5242880,
      "verifyChecksums": true,
      "skipExisting": true
    },
    "discord": {
      "enabled": true,
      "channels": [
        "683985075704299520",
        "1139908458968252457"
      ],
      "authMethod": "token",
      "includeArchived": true,
      "skipExisting": true
    },
    "hognose": {
      "enabled": true,
      "includePrerelease": false,
      "skipExisting": true,
      "verifyChecksums": true
    }
  },
  "logging": {
    "level": "info",
    "file": "/var/log/manic-miners/indexer.log"
  },
  "performance": {
    "maxMemory": 8192,
    "diskCache": true
  }
}
```

### Limited Bandwidth Configuration

```json
{
  "sources": {
    "archive": {
      "enabled": true,
      "maxConcurrentDownloads": 2,
      "bandwidthLimit": 524288,
      "downloadTimeout": 120000
    }
  }
}
```

## Programmatic Configuration

### TypeScript Interface

```typescript
interface IndexerConfig {
  outputDir: string;
  sources: {
    archive: ArchiveConfig & { enabled: boolean };
    discord: DiscordConfig & { enabled: boolean };
    hognose: HognoseConfig & { enabled: boolean };
  };
  logging?: LoggingConfig;
  performance?: PerformanceConfig;
  network?: NetworkConfig;
}
```

### Dynamic Configuration

```typescript
import { MasterIndexer, IndexerConfig } from 'manic-miners-level-indexer';

// Build configuration dynamically
const config: IndexerConfig = {
  outputDir: process.env.OUTPUT_DIR || './output',
  sources: {
    archive: {
      enabled: process.env.ENABLE_ARCHIVE !== 'false',
      searchQueries: process.env.SEARCH_QUERIES?.split(',') || ['manic miners'],
      maxConcurrentDownloads: parseInt(process.env.MAX_DOWNLOADS || '5')
    },
    discord: {
      enabled: process.env.ENABLE_DISCORD !== 'false',
      channels: process.env.DISCORD_CHANNELS?.split(',') || []
    },
    hognose: {
      enabled: process.env.ENABLE_HOGNOSE !== 'false'
    }
  }
};

const indexer = new MasterIndexer(config);
```

### Configuration Validation

```typescript
import { validateConfig } from 'manic-miners-level-indexer';

try {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  validateConfig(config);
  console.log('Configuration is valid');
} catch (error) {
  console.error('Invalid configuration:', error.message);
}
```

## Best Practices

### 1. Environment-Specific Configs

```bash
# Use different configs per environment
config.development.json
config.production.json
config.test.json

# Load based on NODE_ENV
const configFile = `config.${process.env.NODE_ENV || 'development'}.json`;
```

### 2. Secure Sensitive Data

```json
// Never commit tokens to config files
{
  "discord": {
    "token": null  // Use environment variable instead
  }
}
```

### 3. Progressive Enhancement

```json
// Start simple
{
  "sources": {
    "archive": { "enabled": true }
  }
}

// Add options as needed
{
  "sources": {
    "archive": {
      "enabled": true,
      "maxConcurrentDownloads": 10,
      "verifyChecksums": true
    }
  }
}
```

### 4. Monitor Performance

```json
// Development: Fast iteration
{
  "sources": {
    "archive": {
      "maxConcurrentDownloads": 1,
    }
  }
}

// Production: Optimized
{
  "sources": {
    "archive": {
      "maxConcurrentDownloads": 10,
      "bandwidthLimit": 5242880
    }
  }
}
```