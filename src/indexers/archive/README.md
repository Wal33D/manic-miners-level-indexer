# Internet Archive Indexer

This is a significantly enhanced streaming version of the Archive.org indexer with the following improvements:

## Key Features

### 1. **Modern API Usage**
- Uses Archive.org's advancedsearch endpoint with XML output as requested
- Fetches all results in one request with rows=999
- Supports the exact endpoint: `https://archive.org/advancedsearch.php?q=manic+miners+level&fl=identifier,title,creator,date,description&rows=999&page=1&output=xml`

### 2. **Streaming Processing (V2)**
- Processes each item completely (metadata + downloads) before moving to next
- Reduces memory usage by not loading all metadata at once
- Shows progress immediately as each item completes
- Configurable concurrent processing (default 5 items)

### 3. **Resume Capability**
- Maintains state between runs to avoid re-processing items
- Can resume interrupted indexing sessions
- Tracks both successful and failed items

### 4. **Smart Caching**
- Caches item metadata for 24 hours (configurable)
- Reduces API calls on subsequent runs
- Automatically cleans expired cache entries

### 5. **Robust Error Handling**
- Individual item failures don't stop the entire process
- Automatic retry with exponential backoff
- Detailed error tracking and reporting

### 6. **Advanced Features**
- Bandwidth limiting to prevent network saturation
- Checksum verification using MD5 when available
- Support for partial file downloads/resume
- Progress events for real-time monitoring

## Architecture

The improved indexer consists of four main components:

1. **MetadataFetcher** - Handles API calls and caching
2. **DownloadManager** - Manages file downloads with queue system
3. **StateManager** - Handles persistence and resume capability
4. **InternetArchiveIndexer** - Main orchestrator class with streaming support

## Configuration

```json
{
  "archive": {
    "enabled": true,
    "searchQueries": ["manic miners level"],
    "maxConcurrentProcessing": 5,
    "maxConcurrentDownloads": 10,
    "enableCache": true,
    "cacheExpiry": 86400,
    "retryAttempts": 3,
    "downloadTimeout": 60000,
    "bandwidthLimit": null,
    "skipExisting": true,
    "verifyChecksums": false
  }
}
```

## Usage

The V2 streaming indexer is now the default implementation for all Archive.org indexing.

### Running the Indexer
```bash
# Run the archive indexer
npm run index:archive

# Or run all indexers
npm run index
```

### Programmatic Usage
```typescript
import { InternetArchiveIndexer } from './src/indexers/archive';

const indexer = new InternetArchiveIndexer(config, outputDir);

// Listen to progress events
indexer.on('downloadProgress', (progress) => {
  console.log(`Downloading: ${progress.bytesDownloaded}/${progress.totalBytes}`);
});

// Start indexing
const result = await indexer.indexArchive((progress) => {
  console.log(`${progress.phase}: ${progress.message}`);
});
```

## Performance Comparison

| Metric | Original | V2 Streaming |
|--------|----------|--------------|
| Processing Mode | Batch | Streaming |
| Memory Usage | High (all metadata) | Low (per-item) |
| Progress Visibility | After batch | Immediate |
| Concurrent Items | N/A | 5 (configurable) |
| Resume Support | No | Yes |
| Caching | No | Yes |
| Downloads per Item | Sequential | Parallel |

## Files Created

- `.cache/metadata/` - Cached metadata files
- `.cache/indexer-state.json` - Persistent state for resume
- `levels/*/catalog.json` - Level metadata
- `levels/*/*.dat` - Downloaded level files