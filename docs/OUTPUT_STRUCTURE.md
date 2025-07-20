# Output Structure Documentation

Detailed documentation of the file structure, formats, and schemas used by the Manic Miners Level Indexer.

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [File Formats](#file-formats)
3. [Catalog Schema](#catalog-schema)
4. [Level Metadata Schema](#level-metadata-schema)
5. [Master Index Schema](#master-index-schema)
6. [Source-Specific Variations](#source-specific-variations)
7. [File Naming Conventions](#file-naming-conventions)

## Directory Structure

The indexer creates a well-organized directory structure for storing levels and metadata:

```
output/                              # Root output directory
├── catalog_index.json              # Master catalog of all levels
├── master_index.json              # Enhanced index with statistics
├── levels-archive/                # Archive.org levels
│   ├── catalog_index.json        # Archive-specific catalog
│   ├── 550e8400-e29b-41d4-a716-446655440000/
│   │   ├── catalog.json          # Level metadata
│   │   ├── level.dat            # Game data file
│   │   ├── screenshot.jpg       # Preview image
│   │   └── thumbnail.png        # Thumbnail image
│   └── [more level directories...]
├── levels-discord/                # Discord levels
│   ├── catalog_index.json        # Discord-specific catalog
│   ├── a1b2c3d4-e5f6-7890-abcd-ef1234567890/
│   │   ├── catalog.json
│   │   ├── AncientCave.dat     # Original filename preserved
│   │   └── preview.png
│   └── [more level directories...]
└── levels-hognose/               # Hognose repository levels
    ├── catalog_index.json        # Hognose-specific catalog
    └── release-v0.11.2/          # Grouped by release
        ├── hognose-0001/
        │   ├── catalog.json
        │   └── level.dat
        └── [more levels...]
```

## File Formats

### 1. JSON Files

All metadata files use JSON format with UTF-8 encoding:

- **catalog_index.json**: Master and source-specific catalogs
- **catalog.json**: Individual level metadata
- **master_index.json**: Statistical analysis and indexes

### 2. Level Files (.dat)

Manic Miners level data files in various formats:
- **below-v1**: Legacy format (typically < 10KB)
- **v1**: Standard format (10-50KB)
- **v2**: Extended format (50KB+)

### 3. Image Files

Level previews and screenshots:
- **Formats**: JPEG, PNG, GIF
- **Types**: screenshots, thumbnails, previews
- **Naming**: Preserved from source when possible

## Catalog Schema

### catalog_index.json

The main catalog index containing all levels:

```json
{
  "totalLevels": 1234,
  "sources": {
    "archive": 456,
    "discord": 678,
    "hognose": 100
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "formatVersion": "1.0",
  "levels": [
    {
      "metadata": { /* LevelMetadata */ },
      "files": [ /* LevelFile[] */ ],
      "catalogPath": "levels-archive/550e8400-e29b-41d4-a716-446655440000/catalog.json",
      "datFilePath": "levels-archive/550e8400-e29b-41d4-a716-446655440000/level.dat",
      "indexed": "2024-01-15T10:30:00.000Z",
      "lastUpdated": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Field Descriptions

- **totalLevels**: Total count of indexed levels
- **sources**: Breakdown by source
- **lastUpdated**: ISO 8601 timestamp of last update
- **formatVersion**: Schema version for compatibility
- **levels**: Array of Level objects

## Level Metadata Schema

### Individual Level Structure

Each level contains comprehensive metadata:

```typescript
interface Level {
  metadata: LevelMetadata;
  files: LevelFile[];
  catalogPath: string;
  datFilePath: string;
  indexed: Date;
  lastUpdated: Date;
}

interface LevelMetadata {
  // Required fields
  id: string;              // UUID for the level
  title: string;           // Level name
  author: string;          // Creator name
  postedDate: Date;        // Original post/upload date
  source: MapSource;       // 'archive' | 'discord' | 'hognose'
  
  // Optional fields
  description?: string;    // Level description
  sourceUrl?: string;      // Original URL
  originalId?: string;     // Source-specific ID
  fileSize?: number;       // DAT file size in bytes
  requirements?: string[]; // Game requirements
  objectives?: string[];   // Level objectives
  tags?: string[];         // User tags
  difficulty?: number;     // Difficulty rating (1-5)
  rating?: number;        // User rating (1-5)
  downloadCount?: number; // Download counter
  formatVersion?: 'below-v1' | 'v1' | 'v2' | 'unknown';
  releaseId?: string;     // GitHub release ID (Hognose)
}

interface LevelFile {
  filename: string;        // Original filename
  path: string;           // Relative path from output root
  size: number;           // File size in bytes
  hash?: string;          // SHA256 hash (optional)
  type: 'dat' | 'image' | 'thumbnail' | 'other';
}
```

### Example catalog.json

```json
{
  "metadata": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Crystal Caverns",
    "author": "MinerMike",
    "description": "Navigate through crystal-filled caves to find the lost miners!",
    "postedDate": "2024-01-10T15:30:00.000Z",
    "source": "archive",
    "sourceUrl": "https://archive.org/details/crystal-caverns-manic-miners",
    "originalId": "crystal-caverns-manic-miners",
    "fileSize": 24576,
    "requirements": ["3 Tool Stores", "2 Support Stations"],
    "objectives": ["Collect 50 Energy Crystals", "Find 5 Lost Miners"],
    "tags": ["puzzle", "medium", "crystals", "rescue"],
    "difficulty": 3,
    "rating": 4.5,
    "downloadCount": 142,
    "formatVersion": "v1"
  },
  "files": [
    {
      "filename": "level.dat",
      "path": "levels-archive/550e8400-e29b-41d4-a716-446655440000/level.dat",
      "size": 24576,
      "hash": "sha256:abcdef1234567890...",
      "type": "dat"
    },
    {
      "filename": "screenshot.jpg",
      "path": "levels-archive/550e8400-e29b-41d4-a716-446655440000/screenshot.jpg",
      "size": 156789,
      "type": "image"
    }
  ],
  "catalogPath": "levels-archive/550e8400-e29b-41d4-a716-446655440000/catalog.json",
  "datFilePath": "levels-archive/550e8400-e29b-41d4-a716-446655440000/level.dat",
  "indexed": "2024-01-15T10:30:00.000Z",
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

## Master Index Schema

### master_index.json

Enhanced index with statistics and analytics:

```json
{
  "version": "1.0",
  "generated": "2024-01-15T10:30:00.000Z",
  "totalLevels": 1234,
  "sources": {
    "archive": { "count": 456, "percentage": 37.0 },
    "discord": { "count": 678, "percentage": 55.0 },
    "hognose": { "count": 100, "percentage": 8.1 }
  },
  "statistics": {
    "byAuthor": {
      "MinerMike": 45,
      "Baraklava": 38,
      "CrystalSeeker": 27
    },
    "byYear": {
      "2024": 234,
      "2023": 567,
      "2022": 433
    },
    "byFormatVersion": {
      "below-v1": 234,
      "v1": 890,
      "v2": 110
    },
    "byDifficulty": {
      "1": 123,
      "2": 234,
      "3": 345,
      "4": 234,
      "5": 123
    },
    "topTags": [
      { "tag": "puzzle", "count": 234 },
      { "tag": "action", "count": 189 },
      { "tag": "exploration", "count": 156 }
    ],
    "fileSizeDistribution": {
      "0-10KB": 234,
      "10-50KB": 567,
      "50-100KB": 123,
      "100KB+": 45
    },
    "topAuthors": [
      { "author": "MinerMike", "levelCount": 45, "avgRating": 4.2 },
      { "author": "Baraklava", "levelCount": 38, "avgRating": 4.7 }
    ],
    "recentLevels": [
      {
        "id": "newest-level-id",
        "title": "Latest Creation",
        "author": "RecentAuthor",
        "postedDate": "2024-01-15T09:00:00.000Z"
      }
    ]
  },
  "dataQuality": {
    "completenessScore": 87.5,
    "levelsWithDescriptions": 1050,
    "levelsWithTags": 980,
    "levelsWithImages": 567,
    "duplicateTitles": 12
  }
}
```

## Source-Specific Variations

### Archive.org Specifics

- **ID Format**: Archive.org item identifier
- **Metadata**: Includes uploader info, collection
- **Files**: Often includes multiple formats
- **Example originalId**: "manic-miners-crystal-cave"

### Discord Specifics

- **ID Format**: Message ID from Discord
- **Metadata**: Thread info, channel details
- **Files**: Original filenames preserved
- **Example sourceUrl**: "https://discord.com/channels/580269696369164299/1139908458968252457/1234567890"

### Hognose Specifics

- **ID Format**: Release tag + level number
- **Metadata**: GitHub release information
- **Organization**: Grouped by release version
- **Example releaseId**: "v0.11.2"

## File Naming Conventions

### Level Directories

- **Format**: UUID v4 (archive, discord) or descriptive (hognose)
- **Example**: `550e8400-e29b-41d4-a716-446655440000`
- **Hognose**: `release-v0.11.2/hognose-0001`

### DAT Files

- **Archive.org**: Always `level.dat`
- **Discord**: Original filename preserved
- **Hognose**: Pattern like `hognose-XXXX.dat`

### Image Files

- **Screenshots**: `screenshot.{jpg|png}`
- **Thumbnails**: `thumbnail.{jpg|png}`
- **Previews**: `preview.{jpg|png}`
- **Additional**: Original names preserved

### Special Files

- **Catalog**: Always `catalog.json`
- **Index**: Always `catalog_index.json`
- **Master**: Always `master_index.json`

## Data Validation

### Required Fields

Every level must have:
- `id`: Unique identifier
- `title`: Level name (non-empty)
- `author`: Creator name
- `source`: Valid MapSource enum
- `postedDate`: Valid date

### File Integrity

- DAT files must exist and be readable
- File sizes must match metadata
- Paths must be relative to output root
- No absolute paths in catalogs

### Consistency Rules

- Level ID must be unique within source
- Files array must contain at least one DAT file
- Dates must be valid ISO 8601 format
- Source URLs must be valid URLs

## Usage Examples

### Reading Catalog

```typescript
import fs from 'fs-extra';

// Read master catalog
const catalog = await fs.readJSON('./output/catalog_index.json');
console.log(`Total levels: ${catalog.totalLevels}`);

// Read specific level
const levelId = '550e8400-e29b-41d4-a716-446655440000';
const level = catalog.levels.find(l => l.metadata.id === levelId);
```

### Filtering Levels

```typescript
// Find all puzzle levels
const puzzleLevels = catalog.levels.filter(level => 
  level.metadata.tags?.includes('puzzle')
);

// Find levels by author
const authorLevels = catalog.levels.filter(level =>
  level.metadata.author === 'Baraklava'
);

// Find recent levels
const recentDate = new Date();
recentDate.setDate(recentDate.getDate() - 30);
const recentLevels = catalog.levels.filter(level =>
  new Date(level.metadata.postedDate) > recentDate
);
```

### Accessing Files

```typescript
// Get level files
const level = catalog.levels[0];
const datFile = level.files.find(f => f.type === 'dat');
const imagePath = level.files.find(f => f.type === 'image')?.path;

// Read level data
import path from 'path';
const datPath = path.join('./output', datFile.path);
const levelData = await fs.readFile(datPath);
```