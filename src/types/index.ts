export enum MapSource {
  INTERNET_ARCHIVE = 'internet_archive',
  DISCORD_COMMUNITY = 'discord_community',
  DISCORD_ARCHIVE = 'discord_archive',
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
  sources: Partial<Record<MapSource, number>>;
  lastUpdated: Date;
  levels: Level[];
}

export interface IndexerConfig {
  outputDir: string;
  sources: {
    internet_archive: {
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
      retryAttempts?: number;
      downloadTimeout?: number;
      bandwidthLimit?: number;
      skipExisting?: boolean;
      verifyChecksums?: boolean;
    };
    discord_community: {
      enabled: boolean;
      channels: string[];
      excludedThreads?: string[];
      retryAttempts?: number;
      downloadTimeout?: number;
      skipExisting?: boolean;
    };
    discord_archive: {
      enabled: boolean;
      channels: string[];
      excludedThreads?: string[];
      retryAttempts?: number;
      downloadTimeout?: number;
      skipExisting?: boolean;
    };
    hognose: {
      enabled: boolean;
      githubRepo?: string;
      retryAttempts?: number;
      downloadTimeout?: number;
      verifyChecksums?: boolean;
      skipExisting?: boolean;
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
  author: {
    id: string;
    username: string;
    discriminator: string;
  };
  timestamp: string;
  channelId?: string;
  attachments: {
    filename: string;
    url: string;
    size: number;
  }[];
}
