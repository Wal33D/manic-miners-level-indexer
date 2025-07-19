export interface ArchiveSearchOptions {
  queries: string[];
  dateRange?: {
    from: string;
    to: string;
  };
  fields?: string[];
  sorts?: string[];
  maxResults?: number;
}

export interface ArchiveMetadata {
  identifier: string;
  title: string;
  creator?: string;
  date?: string;
  description?: string;
  mediatype?: string;
  collection?: string[];
  downloads?: number;
  item_size?: number;
  files_count?: number;
}

export interface ArchiveFile {
  name: string;
  source: string;
  format: string;
  size?: string;
  md5?: string;
  sha1?: string;
  crc32?: string;
  mtime?: string;
  original?: string;
}

export interface ArchiveItemDetails {
  metadata: ArchiveMetadata;
  files: ArchiveFile[];
  server?: string;
  uniq?: number;
  updated?: number;
  workable_servers?: string[];
}

export interface DownloadTask {
  itemId: string;
  file: ArchiveFile;
  url: string;
  localPath: string;
  retries: number;
  priority: number;
}

export interface IndexerState {
  lastRun?: Date;
  processedItems: Set<string>;
  failedItems: Map<string, string>;
  cursor?: string;
  totalProcessed: number;
  totalFailed: number;
}

export interface ArchiveIndexerConfig {
  enabled: boolean;
  baseUrl?: string;
  searchQueries?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
  maxConcurrentMetadata?: number;
  maxConcurrentDownloads?: number;
  maxConcurrentProcessing?: number; // How many items to process in parallel
  enableCache?: boolean;
  cacheExpiry?: number; // seconds
  retryAttempts?: number;
  downloadTimeout?: number; // ms
  bandwidthLimit?: number; // bytes per second
  skipExisting?: boolean;
  verifyChecksums?: boolean;
}
