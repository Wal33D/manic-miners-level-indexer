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
  formatVersion?: 'below-v1' | 'v1' | 'v2' | 'unknown';
  releaseId?: string;
  discordChannelId?: string;
  discordChannelName?: string;
}

export interface LevelFile {
  filename: string;
  path: string;
  size: number;
  hash?: string;
  type: 'dat' | 'image' | 'thumbnail' | 'other';
}

export interface Level {
  metadata: LevelMetadata;
  files: LevelFile[];
  catalogPath: string;
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
}

export interface IndexerProgress {
  phase: 'scraping' | 'downloading' | 'cataloging' | 'indexing';
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
  channelId?: string;
  attachments: {
    filename: string;
    url: string;
    size: number;
  }[];
}

export interface DuplicateGroup {
  hash: string;
  fileSize: number;
  levels: Array<{
    id: string;
    source: MapSource;
    title: string;
    author: string;
    path: string;
    uploadDate?: Date;
    metadata: LevelMetadata;
  }>;
}

export interface DuplicateAnalysisReport {
  totalLevels: number;
  uniqueLevels: number;
  duplicateCount: number;
  duplicateGroups: DuplicateGroup[];
  statistics: {
    bySource: {
      [MapSource.ARCHIVE]: {
        total: number;
        unique: number;
        duplicates: number;
      };
      [MapSource.DISCORD]: {
        total: number;
        unique: number;
        duplicates: number;
      };
      [MapSource.HOGNOSE]: {
        total: number;
        unique: number;
        duplicates: number;
      };
    };
    crossSourceDuplicates: number;
    withinSourceDuplicates: number;
    largestDuplicateGroup: number;
  };
  generatedAt: Date;
}
