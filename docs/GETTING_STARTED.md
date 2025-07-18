# Getting Started with Manic Miners Level Indexer

This guide will walk you through setting up and running the Manic Miners Level Indexer for the first time.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Environment Setup](#environment-setup)
4. [First Run](#first-run)
5. [Understanding the Output](#understanding-the-output)
6. [Next Steps](#next-steps)

## System Requirements

### Minimum Requirements
- **Node.js**: Version 18.0.0 or higher
- **Memory**: 4GB RAM (8GB recommended for large indexing operations)
- **Storage**: At least 2GB free space for level data
- **Internet**: Stable connection for downloading levels

### Operating System Support
- macOS 10.15+
- Windows 10/11
- Linux (Ubuntu 20.04+, Debian 10+, or equivalent)

### Required Software
```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Check npm version
npm --version   # Should be v8.0.0 or higher
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/manic-miners-level-indexer.git
cd manic-miners-level-indexer
```

### 2. Install Dependencies

```bash
# Install production and development dependencies
npm install

# If you encounter permission errors on Linux/macOS:
sudo npm install --unsafe-perm
```

### 3. Build the Project

```bash
# Compile TypeScript to JavaScript
npm run build

# Verify build succeeded
ls dist/  # Should see compiled JavaScript files
```

## Environment Setup

### Discord Authentication (Optional but Recommended)

To index Discord levels, you'll need a Discord user token. There are multiple ways to provide it:

#### Method 1: Environment File (Recommended)
```bash
# Create .env file
touch .env

# Add your Discord token
echo "DISCORD_TOKEN=your_discord_token_here" >> .env
```

#### Method 2: Environment Variable
```bash
# Linux/macOS
export DISCORD_TOKEN="your_discord_token_here"

# Windows (Command Prompt)
set DISCORD_TOKEN=your_discord_token_here

# Windows (PowerShell)
$env:DISCORD_TOKEN="your_discord_token_here"
```

#### Method 3: Token File
```bash
# Create token file in home directory
echo "your_discord_token_here" > ~/.discord-token
```

### Configuration File (Optional)

Create a custom configuration file to control indexing behavior:

```bash
# Copy the template
cp config.template.json config.json

# Edit with your preferences
nano config.json  # or use your preferred editor
```

Example `config.json`:
```json
{
  "outputDir": "./output",
  "sources": {
    "archive": {
      "enabled": true,
      "searchQueries": ["manic miners level", "manic miners map"],
      "maxConcurrentDownloads": 3
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

## First Run

### Quick Test Run

Start with a quick test to ensure everything is working:

```bash
# This will index ~20 levels from each source
npm run test:quick
```

Expected output:
```
ℹ Starting Archive.org indexer test...
ℹ Output directory: .test-outputs/integration/archive
▶ Archive.org Indexer (V2 - Streaming Mode)
  ✓ Fire Menace | Manic Miners custom level
  ✓ Bug Catcher | Manic Miners custom level
  ... (more levels)
✓ Test completed successfully!
```

### Index Individual Sources

Test each source individually:

```bash
# Archive.org (no authentication required)
npm run index:archive

# Discord (requires authentication)
npm run index:discord

# Hognose GitHub repository
npm run index:hognose
```

### Full Indexing

Once you've verified individual sources work:

```bash
# Index all sources
npm run index

# Or use the development script for more verbose output
npm run dev
```

## Understanding the Output

### Directory Structure

After indexing, your output directory will look like:

```
output/
├── catalog_index.json         # Master catalog listing all levels
├── master_index.json         # Enhanced index with statistics
├── levels-archive/           # Levels from Archive.org
│   ├── catalog_index.json   # Archive-specific catalog
│   ├── 123e4567-e89b-.../  # Individual level directory
│   │   ├── catalog.json     # Level metadata
│   │   ├── level.dat       # The actual level file
│   │   └── preview.jpg     # Level preview (if available)
│   └── ...
├── levels-discord/          # Levels from Discord
└── levels-hognose/         # Levels from Hognose
```

### Key Files Explained

#### catalog_index.json
Contains a complete list of all indexed levels:
```json
{
  "totalLevels": 150,
  "sources": {
    "archive": 50,
    "discord": 75,
    "hognose": 25
  },
  "lastUpdated": "2024-01-15T10:30:00Z",
  "levels": [...]
}
```

#### Individual Level catalog.json
Contains detailed metadata for each level:
```json
{
  "metadata": {
    "id": "unique-level-id",
    "title": "Crystal Caverns",
    "author": "MinerMike",
    "description": "Navigate through crystal-filled caves...",
    "postedDate": "2024-01-10T15:30:00Z",
    "tags": ["puzzle", "medium", "crystals"],
    "formatVersion": "v1"
  },
  "files": [...],
  "indexed": "2024-01-15T10:30:00Z"
}
```

### Viewing Results

Check indexing results:

```bash
# Show output directory structure
npm run show:output

# Validate the catalog
npm run validate:catalog

# View catalog statistics
cat output/master_index.json | jq '.statistics'
```

## Next Steps

### 1. Explore the Catalog

Use the provided tools to explore your indexed levels:

```bash
# Count total levels
cat output/catalog_index.json | jq '.totalLevels'

# List all authors
cat output/catalog_index.json | jq '.levels[].metadata.author' | sort | uniq

# Find levels by a specific author
cat output/catalog_index.json | jq '.levels[] | select(.metadata.author == "AuthorName")'
```

### 2. Set Up Automated Indexing

Create a cron job (Linux/macOS) or scheduled task (Windows) to run indexing regularly:

```bash
# Example cron job (runs daily at 2 AM)
0 2 * * * cd /path/to/indexer && npm run index >> indexing.log 2>&1
```

### 3. Integrate with Your Application

Use the indexer programmatically in your own projects:

```typescript
import { MasterIndexer } from 'manic-miners-level-indexer';

const indexer = new MasterIndexer({
  outputDir: './my-levels',
  sources: { /* your config */ }
});

await indexer.indexAll();
```

### 4. Customize Indexing

- Modify search queries for Archive.org
- Add new Discord channels to monitor
- Adjust concurrent download limits
- Enable bandwidth limiting

See the [Configuration Guide](CONFIGURATION.md) for all options.

## Troubleshooting

### Common Issues

**npm install fails**
```bash
# Clear npm cache
npm cache clean --force

# Try with different registry
npm install --registry https://registry.npmjs.org/
```

**TypeScript build errors**
```bash
# Clean and rebuild
npm run clean
npm run build
```

**Discord authentication fails**
- Verify your token is correct
- Check token hasn't expired
- Try manual authentication mode
- See [Discord Authentication Guide](DISCORD_AUTHENTICATION.md)

**Out of memory errors**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run index
```

For more issues, see the [Troubleshooting Guide](TROUBLESHOOTING.md).

## Getting Help

- Check the [FAQ](TROUBLESHOOTING.md#faq)
- Open an [issue on GitHub](https://github.com/your-username/manic-miners-level-indexer/issues)
- Review the [API documentation](API_REFERENCE.md)
- Join our [Discord community](https://discord.gg/manic-miners)