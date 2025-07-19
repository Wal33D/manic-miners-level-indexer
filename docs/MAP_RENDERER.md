# Map Renderer Design Document

This document outlines the design and integration plan for the upcoming Map Renderer feature, which will generate visual thumbnails and blueprints for Manic Miners levels.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Technical Requirements](#technical-requirements)
4. [Integration Points](#integration-points)
5. [Data Structures](#data-structures)
6. [Rendering Pipeline](#rendering-pipeline)
7. [API Design](#api-design)
8. [Performance Considerations](#performance-considerations)
9. [Implementation Roadmap](#implementation-roadmap)

## Overview

The Map Renderer will provide visual representations of Manic Miners levels, enhancing the catalog with:
- **Thumbnail Generation**: Small preview images for catalog browsing
- **Blueprint Rendering**: Detailed map layouts showing tiles, objects, and paths
- **Visual Analytics**: Heat maps and overlays for level analysis
- **Multiple Formats**: PNG, JPEG, WebP, and SVG output support

### Goals

1. **Enhance Discovery**: Help players find levels visually
2. **Preview Content**: Show level layout before downloading
3. **Support Analysis**: Visual representation for the Level Profiler
4. **Improve UX**: Rich visual catalog interface

## Architecture Design

### Module Structure

```
src/
├── renderer/
│   ├── index.ts              # Main renderer module
│   ├── mapParser.ts          # DAT file parser
│   ├── tileRenderer.ts       # Tile rendering engine
│   ├── objectRenderer.ts     # Object placement renderer
│   ├── thumbnailGenerator.ts # Thumbnail creation
│   ├── blueprintGenerator.ts # Full blueprint generation
│   ├── types.ts              # Renderer-specific types
│   └── assets/               # Tile and object sprites
│       ├── tiles/
│       ├── objects/
│       └── sprites.json
```

### Component Relationships

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Map Parser    │────▶│ Render Engine│────▶│ Image Generator │
└─────────────────┘     └──────────────┘     └─────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
    Parse DAT           Create Canvas          Export Images
    Extract Data        Draw Elements          Save to Disk
    Build Model         Apply Styles           Update Catalog
```

## Technical Requirements

### Dependencies

```json
{
  "dependencies": {
    "canvas": "^2.11.0",      // Node.js canvas implementation
    "sharp": "^0.32.0",       // High-performance image processing
    "pngjs": "^7.0.0",        // PNG encoding/decoding
    "svg.js": "^3.2.0"        // SVG generation
  }
}
```

### System Requirements

- **Memory**: Additional 2GB RAM for rendering operations
- **CPU**: Multi-core recommended for parallel rendering
- **Storage**: ~500MB for sprite assets and temp files

## Integration Points

### 1. Indexer Integration

```typescript
// src/indexers/base/baseIndexer.ts
export abstract class BaseIndexer {
  protected async processLevel(level: Level): Promise<void> {
    // Existing processing...
    
    // New: Generate visuals if renderer enabled
    if (this.config.enableRenderer) {
      const renderer = new MapRenderer(this.config.renderer);
      const visuals = await renderer.render(level.datFilePath);
      
      // Add visual metadata
      level.metadata.thumbnail = visuals.thumbnailPath;
      level.metadata.blueprint = visuals.blueprintPath;
      level.files.push(...visuals.files);
    }
  }
}
```

### 2. Catalog Enhancement

```typescript
// src/types/index.ts
export interface LevelMetadata {
  // Existing fields...
  
  // New visual fields
  thumbnail?: string;        // Path to thumbnail image
  blueprint?: string;        // Path to full blueprint
  visualMetadata?: {
    width: number;           // Map width in tiles
    height: number;          // Map height in tiles
    tileCount: number;       // Total tiles
    objectCount: number;     // Total objects
    dominantColor?: string;  // Main color theme
    complexity?: number;     // Visual complexity score
  };
}
```

### 3. Configuration

```typescript
// src/config/rendererConfig.ts
export interface RendererConfig {
  enabled: boolean;
  thumbnail: {
    width: number;           // Default: 256
    height: number;          // Default: 256
    format: 'png' | 'jpeg' | 'webp';
    quality: number;         // 0-100 for JPEG/WebP
  };
  blueprint: {
    scale: number;           // Pixels per tile (default: 16)
    format: 'png' | 'svg';
    showGrid: boolean;
    showObjects: boolean;
    showPaths: boolean;
    maxSize: number;         // Max dimension in pixels
  };
  performance: {
    concurrent: number;      // Parallel renders
    cacheSprites: boolean;
    useTempDir: boolean;
  };
}
```

## Data Structures

### Map Data Model

```typescript
// src/renderer/types.ts
export interface MapData {
  version: 'below-v1' | 'v1' | 'v2';
  dimensions: {
    width: number;
    height: number;
  };
  tiles: Tile[][];
  objects: GameObject[];
  metadata: {
    title?: string;
    author?: string;
    objectives?: string[];
  };
}

export interface Tile {
  type: TileType;
  x: number;
  y: number;
  variant?: number;
  properties?: Record<string, any>;
}

export enum TileType {
  SOLID_ROCK = 0,
  LOOSE_ROCK = 1,
  DIRT = 2,
  LAVA = 3,
  WATER = 4,
  CRYSTAL = 5,
  ORE = 6,
  RECHARGE = 7,
  // ... more tile types
}

export interface GameObject {
  type: ObjectType;
  x: number;
  y: number;
  rotation?: number;
  properties?: Record<string, any>;
}

export enum ObjectType {
  TOOL_STORE = 'tool_store',
  TELEPORT = 'teleport',
  MINER = 'miner',
  VEHICLE = 'vehicle',
  BUILDING = 'building',
  // ... more object types
}
```

### Render Output

```typescript
export interface RenderResult {
  thumbnailPath: string;
  blueprintPath: string;
  files: LevelFile[];
  metadata: {
    renderTime: number;
    fileSize: {
      thumbnail: number;
      blueprint: number;
    };
  };
}
```

## Rendering Pipeline

### 1. Parse Level Data

```typescript
export class MapParser {
  async parse(datPath: string): Promise<MapData> {
    const buffer = await fs.readFile(datPath);
    
    // Detect format version
    const version = this.detectVersion(buffer);
    
    // Parse based on version
    switch (version) {
      case 'below-v1':
        return this.parseV0(buffer);
      case 'v1':
        return this.parseV1(buffer);
      case 'v2':
        return this.parseV2(buffer);
      default:
        throw new Error(`Unknown format: ${version}`);
    }
  }
  
  private detectVersion(buffer: Buffer): string {
    // Version detection logic
    // Check file size, header patterns, etc.
  }
}
```

### 2. Render Tiles

```typescript
export class TileRenderer {
  private sprites: Map<TileType, Canvas>;
  
  async loadSprites(): Promise<void> {
    // Load tile sprites from assets
    for (const [type, path] of TILE_SPRITES) {
      const image = await loadImage(path);
      this.sprites.set(type, image);
    }
  }
  
  renderTile(
    ctx: CanvasRenderingContext2D,
    tile: Tile,
    scale: number
  ): void {
    const sprite = this.sprites.get(tile.type);
    if (!sprite) return;
    
    const x = tile.x * scale;
    const y = tile.y * scale;
    
    // Apply tile variant if needed
    if (tile.variant) {
      // Handle sprite variants
    }
    
    ctx.drawImage(sprite, x, y, scale, scale);
  }
}
```

### 3. Generate Outputs

```typescript
export class ImageGenerator {
  async generateThumbnail(
    canvas: Canvas,
    config: ThumbnailConfig
  ): Promise<string> {
    // Scale down to thumbnail size
    const thumbnail = createCanvas(config.width, config.height);
    const ctx = thumbnail.getContext('2d');
    
    // Calculate scaling
    const scale = Math.min(
      config.width / canvas.width,
      config.height / canvas.height
    );
    
    // Center and draw
    const x = (config.width - canvas.width * scale) / 2;
    const y = (config.height - canvas.height * scale) / 2;
    
    ctx.drawImage(canvas, x, y, 
      canvas.width * scale, 
      canvas.height * scale
    );
    
    // Save to file
    const outputPath = this.getOutputPath('thumbnail', config.format);
    await this.saveImage(thumbnail, outputPath, config);
    
    return outputPath;
  }
}
```

## API Design

### Public API

```typescript
export class MapRenderer {
  constructor(config: RendererConfig);
  
  // Main rendering method
  async render(datPath: string): Promise<RenderResult>;
  
  // Individual components
  async generateThumbnail(datPath: string): Promise<string>;
  async generateBlueprint(datPath: string): Promise<string>;
  
  // Batch operations
  async renderBatch(datPaths: string[]): Promise<RenderResult[]>;
  
  // Utilities
  async extractMapData(datPath: string): Promise<MapData>;
  clearCache(): void;
}
```

### Usage Example

```typescript
import { MapRenderer } from './renderer';

const renderer = new MapRenderer({
  enabled: true,
  thumbnail: {
    width: 256,
    height: 256,
    format: 'png',
    quality: 90
  },
  blueprint: {
    scale: 16,
    format: 'png',
    showGrid: true,
    showObjects: true,
    maxSize: 4096
  }
});

// Render single level
const result = await renderer.render('./level.dat');
console.log(`Thumbnail: ${result.thumbnailPath}`);
console.log(`Blueprint: ${result.blueprintPath}`);

// Batch rendering
const results = await renderer.renderBatch(levelPaths);
```

## Performance Considerations

### 1. Memory Management

```typescript
export class RenderPool {
  private canvasPool: Canvas[] = [];
  private maxPoolSize = 10;
  
  getCanvas(width: number, height: number): Canvas {
    // Reuse canvases from pool
    let canvas = this.canvasPool.pop();
    if (!canvas) {
      canvas = createCanvas(width, height);
    } else {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }
  
  releaseCanvas(canvas: Canvas): void {
    if (this.canvasPool.length < this.maxPoolSize) {
      // Clear canvas
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.canvasPool.push(canvas);
    }
  }
}
```

### 2. Parallel Processing

```typescript
export class BatchRenderer {
  async renderBatch(
    levels: Level[],
    concurrency: number = 4
  ): Promise<RenderResult[]> {
    const limit = pLimit(concurrency);
    
    const tasks = levels.map(level => 
      limit(() => this.renderSingle(level))
    );
    
    return Promise.all(tasks);
  }
}
```

### 3. Caching Strategy

```typescript
export class SpriteCache {
  private cache = new Map<string, Canvas>();
  private maxCacheSize = 100 * 1024 * 1024; // 100MB
  private currentSize = 0;
  
  async getSprite(path: string): Promise<Canvas> {
    if (this.cache.has(path)) {
      return this.cache.get(path)!;
    }
    
    const sprite = await loadImage(path);
    this.addToCache(path, sprite);
    return sprite;
  }
  
  private addToCache(path: string, sprite: Canvas): void {
    const size = sprite.width * sprite.height * 4; // RGBA
    
    // Evict old entries if needed
    while (this.currentSize + size > this.maxCacheSize) {
      this.evictOldest();
    }
    
    this.cache.set(path, sprite);
    this.currentSize += size;
  }
}
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **Create module structure**
   - Set up renderer directory
   - Define TypeScript interfaces
   - Add configuration options

2. **Implement DAT parser**
   - Support all format versions
   - Extract tile and object data
   - Build map data model

3. **Basic rendering**
   - Load sprite assets
   - Render tiles to canvas
   - Generate simple images

### Phase 2: Core Features (Week 3-4)
1. **Thumbnail generation**
   - Scale and crop algorithms
   - Multiple format support
   - Optimization for size

2. **Blueprint rendering**
   - Full map visualization
   - Grid overlay options
   - Object placement

3. **Integration with indexers**
   - Hook into processing pipeline
   - Update catalog metadata
   - Store generated images

### Phase 3: Advanced Features (Week 5-6)
1. **Performance optimization**
   - Implement caching
   - Parallel rendering
   - Memory management

2. **Visual enhancements**
   - Anti-aliasing
   - Color adjustments
   - Visual effects

3. **Analytics integration**
   - Complexity analysis
   - Path visualization
   - Heat maps

### Phase 4: Polish (Week 7-8)
1. **Testing**
   - Unit tests for parser
   - Visual regression tests
   - Performance benchmarks

2. **Documentation**
   - API documentation
   - Usage examples
   - Sprite creation guide

3. **Deployment**
   - Update configuration
   - Migration scripts
   - Performance tuning

## Future Enhancements

### Planned Features
1. **3D Rendering**: Isometric or 3D views
2. **Animated Previews**: GIF or video generation
3. **Interactive Maps**: Web-based viewer
4. **Custom Themes**: Different visual styles
5. **AI Enhancement**: Upscaling and improvements

### Integration Opportunities
1. **Web Interface**: Live preview in catalog
2. **Discord Bot**: Share visual previews
3. **Level Editor**: Import/export support
4. **Community Features**: Visual ratings

## Technical Challenges

### 1. Format Compatibility
- Different DAT versions have different structures
- Need robust error handling
- Graceful degradation for unsupported features

### 2. Performance at Scale
- Thousands of levels to render
- Memory constraints
- Storage requirements

### 3. Visual Quality
- Sprite resolution limitations
- Scaling artifacts
- Color consistency

## Success Metrics

1. **Performance**
   - Render time < 500ms per level
   - Memory usage < 100MB per render
   - Batch processing > 10 levels/second

2. **Quality**
   - Visual accuracy > 95%
   - No rendering artifacts
   - Consistent output quality

3. **Integration**
   - Zero impact on indexing speed
   - Seamless catalog integration
   - Backward compatibility

## Conclusion

The Map Renderer will significantly enhance the Manic Miners Level Indexer by providing visual representations of levels. This design ensures scalable, performant, and maintainable implementation while setting the foundation for future visual features.