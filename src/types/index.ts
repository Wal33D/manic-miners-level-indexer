export enum MapSource {
  ARCHIVE = 'archive',
  DISCORD = 'discord',
  HOGNOSE = 'hognose',
}

export interface LevelMetadata {
  id: string;
  title: string;
  author: string;
  description?: string;
  postedDate: Date;
  source: MapSource;
  sourceUrl?: string;
  originalId?: string;
  fileSize?: number;
  requirements?: string[];
  objectives?: string[];
  tags?: string[];
  difficulty?: number;
  rating?: number;
  downloadCount?: number;
}

export interface LevelFile {
  filename: string;
  path: string;
  size: number;
  hash?: string;
  type: 'dat' | 'screenshot' | 'thumbnail' | 'other';
}

export interface Level {
  metadata: LevelMetadata;
  files: LevelFile[];
  catalogPath: string;
  thumbnailPath?: string;
  screenshotPath?: string;
  datFilePath: string;
  indexed: Date;
  lastUpdated: Date;
}

export interface CatalogIndex {
  totalLevels: number;
  sources: Record<MapSource, number>;
  lastUpdated: Date;
  levels: Level[];
}

export interface IndexerConfig {
  outputDir: string;
  tempDir: string;
  generateThumbnails: boolean;
  generateScreenshots: boolean;
  sources: {
    archive: {
      enabled: boolean;
      baseUrl: string;
      concurrentDownloads?: number;
      searchQueries?: string[];
      dateRange?: {
        from: string;
        to: string;
      };
      maxConcurrentMetadata?: number;
      maxConcurrentDownloads?: number;
      enableCache?: boolean;
      cacheExpiry?: number;
      retryAttempts?: number;
      downloadTimeout?: number;
      bandwidthLimit?: number;
      skipExisting?: boolean;
      verifyChecksums?: boolean;
    };
    discord: {
      enabled: boolean;
      channels: string[];
    };
    hognose: {
      enabled: boolean;
      githubRepo?: string;
      checkInterval?: number;
    };
  };
  rendering: {
    thumbnailSize: { width: number; height: number };
    screenshotSize: { width: number; height: number };
    biomeColors: Record<string, string>;
  };
}

export interface IndexerProgress {
  phase: 'scraping' | 'downloading' | 'rendering' | 'cataloging' | 'indexing';
  source: MapSource;
  current: number;
  total: number;
  message: string;
}

export interface IndexerResult {
  success: boolean;
  levelsProcessed: number;
  levelsSkipped: number;
  errors: string[];
  duration: number;
}

export interface Biome {
  id: number;
  name: string;
  color: string;
  texture?: string;
}

export interface TileData {
  x: number;
  y: number;
  biome: number;
  height: number;
  special?: string;
}

export interface MapData {
  width: number;
  height: number;
  tiles: TileData[][];
  biomes: Biome[];
  objectives: string[];
  requirements: string[];
}

export interface HognoseRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: {
    name: string;
    download_url: string;
    size: number;
  }[];
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  attachments: {
    filename: string;
    url: string;
    size: number;
  }[];
}

export interface ArchiveItem {
  identifier: string;
  title: string;
  creator: string;
  date: string;
  description: string;
  files: {
    name: string;
    size: string;
    format: string;
  }[];
}
