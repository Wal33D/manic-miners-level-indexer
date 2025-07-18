# Manic Miners Level Indexer

A comprehensive indexing system for Manic Miners community levels, automatically collecting and cataloging custom content from multiple sources including Archive.org, Discord channels, and GitHub repositories.

## Overview

The Manic Miners Level Indexer is a TypeScript-based tool that creates a searchable, organized database of community-created levels for the Manic Miners game. It provides automated discovery, validation, and cataloging of custom levels with rich metadata, making it easy for players to find and enjoy community content.

## Key Features

- **Multi-Source Indexing**: Collects levels from Archive.org, Discord channels, and the Hognose GitHub repository
- **Automated Metadata Extraction**: Captures title, author, description, tags, and game requirements
- **Format Version Detection**: Automatically identifies level format versions (below-v1, v1, v2)
- **Quality Validation**: Validates level files and metadata completeness
- **Organized Storage**: Maintains a structured directory with individual level folders
- **Rich Analytics**: Generates statistics on authors, tags, file sizes, and data quality
- **Progress Tracking**: Real-time progress updates during indexing operations
- **Discord Authentication**: Supports both automated and manual Discord authentication
- **Export Capabilities**: Export catalogs to JSON or CSV formats

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- (Optional) Discord user token for Discord indexing

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/manic-miners-level-indexer.git
cd manic-miners-level-indexer

# Install dependencies
npm install

# Create a .env file (optional, for Discord indexing)
cp .env.example .env
# Edit .env and add your Discord token: DISCORD_TOKEN=your_token_here

# Build the project
npm run build
```

### Basic Usage

Index all sources with default configuration:

```bash
npm run index
```

Index individual sources:

```bash
# Index Archive.org levels
npm run index:archive

# Index Discord levels (requires authentication)
npm run index:discord

# Index Hognose repository levels
npm run index:hognose
```

### Quick Test

Run a limited test to verify everything works:

```bash
npm run test:quick
```

This will index a small number of levels from each source for testing.

## Configuration

Create a `config.json` file to customize indexing behavior:

```json
{
  "outputDir": "./output",
  "sources": {
    "archive": {
      "enabled": true,
      "baseUrl": "https://archive.org/advancedsearch.php",
      "searchQueries": ["manic miners level"],
      "maxConcurrentDownloads": 5
    },
    "discord": {
      "enabled": true,
      "channels": [
        "683985075704299520",
        "1139908458968252457"
      ]
    },
    "hognose": {
      "enabled": true,
      "githubRepo": "charredUtensil/hognose"
    }
  }
}
```

## Available Scripts

### Indexing Scripts
- `npm run index` - Index all enabled sources
- `npm run index:archive` - Index Archive.org levels
- `npm run index:discord` - Index Discord levels
- `npm run index:hognose` - Index Hognose levels

### Testing Scripts
- `npm test` - Run unit tests
- `npm run test:quick` - Quick integration test (limited data)
- `npm run test:all` - Full integration test
- `npm run test:analysis` - Test with detailed analysis report

### Utility Scripts
- `npm run show:output` - Display output directory structure
- `npm run validate:catalog` - Validate existing catalog
- `npm run rebuild:catalog` - Rebuild catalog from existing levels
- `npm run clean:test` - Clean test output directories

### Development Scripts
- `npm run dev` - Run in development mode
- `npm run build` - Build TypeScript to JavaScript
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Output Structure

```
output/
├── catalog_index.json          # Master catalog of all levels
├── master_index.json          # Enhanced index with statistics
├── levels-archive/            # Archive.org levels
│   ├── catalog_index.json    # Source-specific catalog
│   └── [uuid]/               # Individual level directory
│       ├── catalog.json      # Level metadata
│       ├── level.dat         # Game data file
│       └── images/           # Screenshots/thumbnails
├── levels-discord/           # Discord levels
└── levels-hognose/          # Hognose repository levels
```

## Programmatic Usage

```typescript
import { MasterIndexer, IndexerConfig } from 'manic-miners-level-indexer';

const config: IndexerConfig = {
  outputDir: './my-levels',
  sources: {
    archive: { enabled: true },
    discord: { enabled: true, channels: ['1139908458968252457'] },
    hognose: { enabled: true }
  }
};

const indexer = new MasterIndexer(config);

// Index all sources
await indexer.indexAll();

// Get catalog statistics
const stats = await indexer.getCatalogStats();
console.log(`Total levels indexed: ${stats.totalLevels}`);

// Export catalog
const exportPath = await indexer.exportCatalog('json');
console.log(`Catalog exported to: ${exportPath}`);
```

## Documentation

- [Getting Started Guide](docs/GETTING_STARTED.md) - Detailed setup and first run
- [Architecture Overview](docs/ARCHITECTURE.md) - System design and components
- [API Reference](docs/API_REFERENCE.md) - Complete API documentation
- [Indexers Guide](docs/INDEXERS.md) - Detailed indexer documentation
- [Discord Authentication](docs/DISCORD_AUTHENTICATION.md) - Discord setup guide
- [Configuration Reference](docs/CONFIGURATION.md) - All configuration options
- [Output Structure](docs/OUTPUT_STRUCTURE.md) - File formats and schemas
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Development Guide](docs/DEVELOPMENT.md) - Contributing and development

## Contributing

We welcome contributions! Please see our [Development Guide](docs/DEVELOPMENT.md) for details on:
- Setting up a development environment
- Code style guidelines
- Testing requirements
- Submitting pull requests

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- The Manic Miners community for creating amazing custom content
- Archive.org for preserving gaming history
- The Hognose project for procedural level generation
- All level authors who share their creative work

## Support

For issues, questions, or suggestions:
- Open an issue on [GitHub](https://github.com/your-username/manic-miners-level-indexer/issues)
- Check the [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- Review existing [discussions](https://github.com/your-username/manic-miners-level-indexer/discussions)