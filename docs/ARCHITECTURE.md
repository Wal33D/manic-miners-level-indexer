# System Architecture

This document provides a comprehensive overview of the Manic Miners Level Indexer architecture, including system design, component relationships, and data flow.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [Module Structure](#module-structure)
5. [Design Patterns](#design-patterns)
6. [Technology Stack](#technology-stack)

## Architecture Overview

The Manic Miners Level Indexer follows a modular, plugin-based architecture that allows for easy extension and maintenance. The system is built around a central orchestrator (MasterIndexer) that coordinates multiple source-specific indexers.

```
┌─────────────────────────────────────────────────────────────┐
│                      MasterIndexer                           │
│  (Orchestrates all indexing operations)                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────────────────┐
     │             │                         │
┌────▼──────┐ ┌───▼──────┐ ┌──────▼──────┐
│ Archive   │ │ Discord  │ │  Hognose    │
│ Indexer   │ │ Indexer  │ │  Indexer    │
└────┬──────┘ └────┬──────┘ └──────┬──────┘
     │             │                │
     └─────────────┼────────────────┘
                   │
            ┌──────▼──────┐
            │  Catalog    │
            │  Manager    │
            └─────────────┘
```

## Core Components

### 1. MasterIndexer
**Location**: `src/catalog/masterIndexer.ts`

The central orchestrator that:
- Manages configuration for all indexers
- Coordinates parallel indexing operations
- Aggregates results from multiple sources
- Generates master catalogs and statistics

```typescript
class MasterIndexer {
  constructor(config: IndexerConfig)
  async indexAll(): Promise<IndexerResult>
  async getCatalogStats(): Promise<CatalogStats>
  async exportCatalog(format: 'json' | 'csv'): Promise<string>
}
```

### 2. Source-Specific Indexers

#### InternetArchiveIndexer
**Location**: `src/indexers/archive/`

- Searches Archive.org for Manic Miners levels
- Implements streaming metadata fetching
- Manages concurrent downloads with rate limiting
- Handles state persistence for resume capability

#### DiscordUnifiedIndexer
**Location**: `src/indexers/discordUnified.ts`

- Fetches levels from Discord forums and channels
- Supports both REST API and browser automation
- Implements token-based authentication
- Handles thread pagination and message parsing

#### HognoseIndexer
**Location**: `src/indexers/hognoseIndexer.ts`

- Indexes levels from GitHub releases
- Processes ZIP files in memory (no temp files)
- Extracts metadata from release notes
- Handles version detection and updates

### 3. CatalogManager
**Location**: `src/catalog/catalogManager.ts`

Manages the level catalog:
- Creates and updates catalog indexes
- Maintains source-specific catalogs
- Handles level deduplication
- Provides search and filter capabilities

### 4. Authentication System

#### DiscordAuth
**Location**: `src/auth/discordAuth.ts`

- Manages Discord authentication flow
- Supports automated and manual login
- Caches tokens and sessions securely
- Handles token validation and refresh

#### DiscordTokenProvider
**Location**: `src/auth/discordTokenProvider.ts`

- Provides tokens from multiple sources
- Priority-based token resolution
- Environment variable support
- File-based token storage

### 5. Utility Modules

#### OutputValidator
**Location**: `src/tests/outputValidator.ts`

- Validates level metadata completeness
- Checks file integrity
- Enforces source-specific rules
- Generates validation reports

#### AnalysisReporter
**Location**: `src/tests/analysisReporter.ts`

- Generates statistical analysis
- Creates data quality reports
- Provides recommendations
- Exports HTML and JSON reports

## Data Flow

### 1. Indexing Flow

```
User Request
    │
    ▼
MasterIndexer.indexAll()
    │
    ├─► Archive Indexer ──► Search API ──► Download Files
    │
    ├─► Discord Indexer ──► Auth Check ──► Fetch Messages ──► Extract Attachments
    │
    └─► Hognose Indexer ──► GitHub API ──► Download Releases ──► Extract ZIPs
              │
              ▼
         Level Data
              │
              ▼
      Format Detection
              │
              ▼
      Metadata Extraction
              │
              ▼
      CatalogManager
              │
              ▼
      File System
```

### 2. Authentication Flow (Discord)

```
Token Request
    │
    ▼
DiscordTokenProvider
    │
    ├─► Check Direct Parameter
    ├─► Check Token File
    ├─► Check Environment Variables
    └─► Check Home Directory
         │
         ▼
    Token Found?
         │
    Yes ─┴─ No
    │         │
    ▼         ▼
Validate   Browser Auth
    │         │
    └─────────┘
         │
         ▼
    Cached Token
```

## Module Structure

```
src/
├── index.ts                 # Main entry point and exports
├── types/                   # TypeScript interfaces and types
│   └── index.ts            # Core type definitions
├── auth/                   # Authentication modules
│   ├── discordAuth.ts      # Discord authentication flow
│   └── discordTokenProvider.ts # Token resolution
├── catalog/                # Catalog management
│   ├── catalogManager.ts   # Catalog CRUD operations
│   └── masterIndexer.ts    # Main orchestrator
├── indexers/               # Source-specific indexers
│   ├── archive/           # Archive.org indexer modules
│   │   ├── index.ts       # Main indexer class
│   │   ├── MetadataFetcher.ts # Metadata retrieval
│   │   ├── DownloadManager.ts # File downloads
│   │   └── StateManager.ts # Persistence
│   ├── discordUnified.ts  # Discord indexer
│   ├── discordDirectAPI.ts # Discord API client
│   └── hognoseIndexer.ts  # GitHub releases indexer
├── utils/                  # Utility functions
│   ├── logger.ts          # Logging utility
│   ├── fileUtils.ts       # File operations
│   ├── sourceUtils.ts     # Source helpers
│   └── datVersionDetector.ts # Format detection
├── tests/                  # Testing utilities
│   ├── outputValidator.ts  # Validation logic
│   └── analysisReporter.ts # Reporting tools
└── scripts/               # Standalone scripts
    └── migrateFormatVersions.ts # Migration tool
```

## Design Patterns

### 1. Plugin Architecture
Each indexer implements a common interface, allowing easy addition of new sources:

```typescript
interface Indexer {
  index(): Promise<Level[]>
  getProgress(): IndexerProgress
  cancel(): void
}
```

### 2. Observer Pattern
Progress tracking uses event emitters for real-time updates:

```typescript
indexer.on('progress', (progress: IndexerProgress) => {
  console.log(`${progress.current}/${progress.total}`);
});
```

### 3. Builder Pattern
Configuration uses a builder pattern for flexible setup:

```typescript
const config = new ConfigBuilder()
  .setOutputDir('./output')
  .enableSource('archive', { maxDownloads: 5 })
  .enableSource('discord', { channels: ['...'] })
  .build();
```

### 4. Strategy Pattern
Different download strategies based on source:
- Archive.org: Concurrent with rate limiting
- Discord: Sequential with authentication
- Hognose: Batch processing of releases

### 5. Facade Pattern
MasterIndexer provides a simplified interface to complex subsystems:

```typescript
// Simple usage hides complexity
const indexer = new MasterIndexer(config);
await indexer.indexAll();
```

## Technology Stack

### Core Technologies
- **TypeScript**: Type-safe development
- **Node.js**: Runtime environment
- **npm**: Package management

### Key Dependencies
- **playwright**: Browser automation for Discord
- **node-fetch**: HTTP client for API calls
- **fs-extra**: Enhanced file system operations
- **unzipper**: ZIP file processing
- **p-limit**: Concurrency control
- **chalk**: Terminal styling
- **dotenv**: Environment configuration

### Development Tools
- **Jest**: Unit testing framework
- **ESLint**: Code quality enforcement
- **Prettier**: Code formatting
- **ts-node**: TypeScript execution

### Data Formats
- **JSON**: Primary data format for catalogs
- **CSV**: Export format for spreadsheets
- **DAT**: Manic Miners level format
- **ZIP**: Archive format for bulk levels

## Performance Considerations

### 1. Concurrent Processing
- Configurable concurrency limits per source
- Memory-efficient streaming for large files
- Progress tracking without blocking

### 2. State Management
- Persistent state for resume capability
- In-memory caching for metadata
- Efficient file system operations

### 3. Error Handling
- Graceful degradation on failures
- Retry logic with exponential backoff
- Comprehensive error reporting

## Security Considerations

### 1. Authentication
- Secure token storage with encryption
- No hardcoded credentials
- Environment-based configuration

### 2. Input Validation
- Sanitized file paths
- Validated API responses
- Safe URL handling

### 3. Resource Limits
- Download size limits
- Timeout configurations
- Memory usage controls

## Extension Points

### Adding New Sources
1. Create indexer implementing base interface
2. Register with MasterIndexer
3. Add configuration schema
4. Update type definitions

### Custom Validators
1. Extend OutputValidator class
2. Add source-specific rules
3. Register validation pipeline

### Export Formats
1. Implement export transformer
2. Register with CatalogManager
3. Add format to export options

## Future Enhancements

### Planned Features
- GraphQL API for catalog queries
- Real-time indexing with webhooks
- Distributed indexing support
- Machine learning for metadata extraction

### Architecture Evolution
- Microservices architecture
- Event-driven processing
- Cloud-native deployment
- Horizontal scaling support