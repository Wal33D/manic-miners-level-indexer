# Manic Miners Level Indexer

![CI](https://github.com/Aquataze/manic-miners-level-indexer/workflows/CI/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

A unified indexing system for Manic Miners levels that combines archive scraping, Hognose indexing, map rendering, and catalog management into a single, powerful tool.

## Features

- **Multi-Source Indexing**: Automatically scrapes and indexes levels from:
  - Internet Archive collections
  - Discord community channels
  - Hognose GitHub releases
- **Visual Processing**: Generates thumbnails and screenshots from .dat files
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
cp config.production.example.json config.json
```

2. Edit `config.json` to customize your settings:
- `outputDir`: Where indexed levels will be stored (default: `./output`)
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
npm run test:archive     # Test archive indexer
npm run test:discord     # Test Discord indexer
npm run test:hognose     # Test Hognose indexer
```

## Architecture

### Core Components

- **Indexers**: Scrape and process levels from different sources
- **Renderer**: Generates visual representations of levels
- **Catalog Manager**: Organizes and manages level metadata
- **Master Indexer**: Coordinates all operations and builds searchable indexes
- **Scripts**: Dedicated scripts for each indexing operation

### Data Flow

1. **Scraping**: Indexers collect level data from various sources
2. **Processing**: .dat files are downloaded and processed
3. **Rendering**: Thumbnails and screenshots are generated
4. **Cataloging**: Metadata is organized and stored
5. **Indexing**: Master index is built for efficient searching

## Configuration

The system uses a JSON configuration file with the following structure:

```json
{
  "outputDir": "./output",
  "tempDir": "./temp",
  "generateThumbnails": true,
  "generateScreenshots": true,
  "sources": {
    "archive": {
      "enabled": true,
      "baseUrl": "https://archive.org/advancedsearch.php",
      "maxPages": 10
    },
    "discord": {
      "enabled": true,
      "channels": ["https://discord.com/channels/..."],
      "maxPages": 50
    },
    "hognose": {
      "enabled": true,
      "githubRepo": "ManicMiners/hognose",
      "checkInterval": 86400000
    }
  },
  "rendering": {
    "thumbnailSize": { "width": 200, "height": 200 },
    "screenshotSize": { "width": 800, "height": 600 },
    "biomeColors": { ... }
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
- `npm run test:archive` - Test archive indexer
- `npm run test:discord` - Test Discord indexer
- `npm run test:hognose` - Test Hognose indexer

### Development Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Run in development mode
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Output Structure

```
output/
├── levels/
│   ├── {level-id}/
│   │   ├── catalog.json
│   │   ├── level.dat
│   │   ├── thumbnail.png
│   │   └── screenshot.png
│   └── ...
├── catalog_index.json
├── master_index.json
├── discord_processed.json
└── hognose_processed.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details