# Manic Miners Level Indexer - Roadmap

This document outlines planned features and improvements for the Manic Miners Level Indexer.

## Planned Features

### 1. Map Renderer - Visual Thumbnail Generation

**Status**: 🔵 Design Phase

The Map Renderer will automatically generate visual thumbnails for Manic Miners levels, making it easier for players to preview levels before downloading them.

#### Key Features:
- Automatic thumbnail generation for all indexed levels
- Support for different zoom levels (full map, detail view)
- Highlight important map features (objectives, special tiles)
- Batch processing capabilities
- Integration with existing catalog system

#### Technical Approach:
- Parse .dat level files to extract map data
- Render tile grid using predefined tile sprites
- Generate PNG thumbnails at multiple resolutions
- Store thumbnails alongside level files

### 2. Level Profiler - Automated Analysis

**Status**: 🔵 Design Phase

The Level Profiler will analyze levels to extract gameplay characteristics and difficulty metrics.

#### Analysis Capabilities:
- **Resource Analysis**: Count crystals, ore, buildings
- **Difficulty Estimation**: Based on objectives, hazards, time limits
- **Size Classification**: Small, medium, large maps
- **Feature Detection**: Water, lava, erosion, monsters
- **Objective Complexity**: Simple vs multi-stage objectives

#### Output Format:
```json
{
  "profile": {
    "difficulty": "medium",
    "estimatedTime": "15-20 minutes",
    "features": ["water", "erosion", "monsters"],
    "resources": {
      "crystals": 45,
      "ore": 120,
      "studs": 200
    }
  }
}
```

## Completed Improvements

✅ **Structured Output Directory** - Implemented organized directory structure
✅ **State Management** - Added persistent state tracking for all indexers
✅ **Checksum Verification** - Implemented file integrity checking
✅ **Filename Sanitization** - Added security for all downloaded files
✅ **Progress Tracking** - Real-time progress updates during indexing
✅ **Export Functionality** - JSON and CSV export capabilities
✅ **Duplicate Detection** - Smart file deduplication system

## In Progress

🟡 **Performance Optimization** - Improving indexing speed and memory usage
🟡 **Enhanced Error Recovery** - Better handling of network failures

## Future Considerations

- Web-based level browser interface
- Level rating and review system
- Integration with game launcher
- Automated level testing framework
- Community contribution portal

## Contributing

If you're interested in helping implement any of these features, please see our [Development Guide](DEVELOPMENT.md).