import fetch from 'node-fetch';
import xml2js from 'xml2js';
import pLimit from 'p-limit';
import { ArchiveItem, Level, LevelMetadata, MapSource, IndexerProgress, IndexerResult } from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import path from 'path';
import fs from 'fs-extra';

export class ArchiveIndexer {
  private baseUrl: string;
  private maxPages: number;
  private outputDir: string;
  private concurrentDownloads: number;
  private downloadLimit: any;
  private activeDownloads: number = 0;
  private completedDownloads: number = 0;
  private totalDownloads: number = 0;

  constructor(baseUrl: string, maxPages: number, outputDir: string, concurrentDownloads: number = 5) {
    this.baseUrl = baseUrl;
    this.maxPages = maxPages;
    this.outputDir = outputDir;
    this.concurrentDownloads = concurrentDownloads;
    this.downloadLimit = pLimit(this.concurrentDownloads);
    logger.info(`Archive indexer initialized with ${this.concurrentDownloads} concurrent downloads`);
  }

  async indexArchive(progressCallback?: (progress: IndexerProgress) => void): Promise<IndexerResult> {
    const startTime = Date.now();
    let levelsProcessed = 0;
    let levelsSkipped = 0;
    const errors: string[] = [];

    try {
      logger.info(`Starting Internet Archive indexing with ${this.concurrentDownloads} concurrent downloads...`);
      
      progressCallback?.({
        phase: 'scraping',
        source: MapSource.ARCHIVE,
        current: 0,
        total: this.maxPages,
        message: 'Fetching archive data...'
      });

      const archiveItems = await this.fetchArchiveData();
      
      // Calculate total downloads needed
      this.totalDownloads = archiveItems.reduce((total, item) => {
        const datFiles = item.files.filter(f => f.name.toLowerCase().endsWith('.dat'));
        const screenshots = item.files.filter(f => 
          f.name.toLowerCase().match(/\.(png|jpg|jpeg)$/i) && 
          f.name.toLowerCase().includes('screenshot')
        ).slice(0, 1);
        return total + datFiles.length + screenshots.length;
      }, 0);
      
      logger.info(`Total files to download: ${this.totalDownloads}`);
      
      progressCallback?.({
        phase: 'downloading',
        source: MapSource.ARCHIVE,
        current: 0,
        total: archiveItems.length,
        message: 'Processing archive items...'
      });

      // Process items in parallel batches
      const batchSize = 10; // Process 10 items at a time
      let processedCount = 0;

      for (let i = 0; i < archiveItems.length; i += batchSize) {
        const batch = archiveItems.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(item => this.downloadLimit(async () => {
            try {
              const level = await this.processArchiveItem(item);
              if (level) {
                await this.saveLevelData(level);
                logger.info(`Processed archive level: ${level.metadata.title}`);
                return { success: true, level };
              } else {
                return { success: false, skipped: true };
              }
            } catch (error) {
              const errorMsg = `Failed to process archive item ${item.identifier}: ${error}`;
              logger.error(errorMsg);
              return { success: false, error: errorMsg };
            }
          }))
        );

        // Count results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              levelsProcessed++;
            } else if (result.value.error) {
              errors.push(result.value.error);
              levelsSkipped++;
            } else {
              levelsSkipped++;
            }
          } else {
            errors.push(`Unexpected error: ${result.reason}`);
            levelsSkipped++;
          }
        }

        processedCount += batch.length;
        const progress = Math.round((this.completedDownloads / this.totalDownloads) * 100);
        progressCallback?.({
          phase: 'downloading',
          source: MapSource.ARCHIVE,
          current: processedCount,
          total: archiveItems.length,
          message: `Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(archiveItems.length / batchSize)} | Files: ${this.completedDownloads}/${this.totalDownloads} (${progress}%) | Active: ${this.activeDownloads}`
        });
      }

      logger.success(`Archive indexing completed: ${levelsProcessed} levels processed, ${levelsSkipped} skipped`);
      
      return {
        success: true,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMsg = `Archive indexing failed: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      
      return {
        success: false,
        levelsProcessed,
        levelsSkipped,
        errors,
        duration: Date.now() - startTime
      };
    }
  }

  private async fetchArchiveData(): Promise<ArchiveItem[]> {
    const items: ArchiveItem[] = [];
    
    try {
      // Get all results in one request with rows=999
      const searchUrl = `${this.baseUrl}?q=manic+miners+level&fl=identifier,title,creator,date,description&rows=999&output=xml`;
      logger.info(`Fetching all archive items: ${searchUrl}`);
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlData = await response.text();
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);
      
      // Check if we have results
      const resultNode = result?.response?.result?.[0];
      if (!resultNode || !resultNode.doc) {
        logger.info(`No results found`);
        return items;
      }
      
      const docs = Array.isArray(resultNode.doc) ? resultNode.doc : [resultNode.doc];
      logger.info(`Found ${docs.length} total items from archive`);
      
      // First, collect all items without file metadata
      const itemsToFetch: ArchiveItem[] = [];
      
      for (const doc of docs) {
        const getStrValue = (name: string): string => {
          const strArray = doc.str || [];
          const found = strArray.find((s: any) => s.$ && s.$.name === name);
          return found ? found._ : '';
        };
        
        const item: ArchiveItem = {
          identifier: getStrValue('identifier'),
          title: getStrValue('title'),
          creator: getStrValue('creator'),
          date: getStrValue('date'),
          description: getStrValue('description'),
          files: []
        };
        
        if (item.identifier && item.title) {
          itemsToFetch.push(item);
        }
      }
      
      logger.info(`Fetching metadata for ${itemsToFetch.length} items...`);
      
      // Fetch file metadata in parallel batches
      const metadataBatchSize = 20; // Fetch 20 metadata requests at a time
      const metadataLimit = pLimit(metadataBatchSize);
      
      for (let i = 0; i < itemsToFetch.length; i += metadataBatchSize) {
        const batch = itemsToFetch.slice(i, i + metadataBatchSize);
        
        await Promise.all(
          batch.map(item => 
            metadataLimit(async () => {
              const filesUrl = `https://archive.org/metadata/${item.identifier}`;
              try {
                const filesResponse = await fetch(filesUrl);
                const filesData = await filesResponse.json() as any;
                
                if (filesData && filesData.files) {
                  item.files = filesData.files
                    .filter((file: any) => file.name && file.size)
                    .map((file: any) => ({
                      name: file.name,
                      size: file.size,
                      format: file.format || path.extname(file.name).substring(1)
                    }));
                }
              } catch (error) {
                logger.warn(`Failed to fetch files for ${item.identifier}:`, error);
              }
            })
          )
        );
        
        logger.info(`Fetched metadata for ${Math.min(i + metadataBatchSize, itemsToFetch.length)} / ${itemsToFetch.length} items`);
      }
      
      // Add items with files to the result
      items.push(...itemsToFetch.filter(item => item.files.length > 0));
        
      logger.info(`Processed ${items.length} archive items`);
      
    } catch (error) {
      logger.error(`Failed to fetch archive data:`, error);
      throw error;
    }
    
    logger.info(`Found ${items.length} total archive items`);
    return items;
  }

  private async processArchiveItem(item: ArchiveItem): Promise<Level | null> {
    try {
      // Look for .dat files in the item
      const datFiles = item.files.filter(file => 
        file.name.toLowerCase().endsWith('.dat') || 
        file.format === 'dat'
      );
      
      if (datFiles.length === 0) {
        logger.debug(`No .dat files found in ${item.identifier}`);
        return null;
      }
      
      const levelId = FileUtils.generateUniqueId();
      const levelDir = path.join(this.outputDir, 'levels', levelId);
      await FileUtils.ensureDir(levelDir);
      
      const metadata: LevelMetadata = {
        id: levelId,
        title: item.title || 'Unknown',
        author: item.creator || 'Unknown',
        description: item.description,
        postedDate: item.date ? new Date(item.date) : new Date(),
        source: MapSource.ARCHIVE,
        sourceUrl: `https://archive.org/details/${item.identifier}`,
        originalId: item.identifier,
        tags: ['archive', 'internet-archive']
      };
      
      const levelFiles: any[] = [];
      
      // Prepare all downloads
      const downloads: Promise<any>[] = [];
      
      // Queue .dat file downloads
      for (const datFile of datFiles) {
        const downloadUrl = `https://archive.org/download/${item.identifier}/${encodeURIComponent(datFile.name)}`;
        const sanitizedFileName = FileUtils.sanitizeFilename(datFile.name);
        const localPath = path.join(levelDir, sanitizedFileName);
        
        downloads.push(
          (async () => {
            this.activeDownloads++;
            try {
              await this.downloadFile(downloadUrl, localPath);
              levelFiles.push({
                filename: sanitizedFileName,
                path: localPath,
                size: parseInt(datFile.size) || 0,
                type: 'dat' as const
              });
              logger.debug(`Downloaded ${datFile.name} from ${item.identifier}`);
            } catch (error) {
              logger.warn(`Failed to download ${datFile.name} from ${item.identifier}:`, error);
            } finally {
              this.activeDownloads--;
              this.completedDownloads++;
            }
          })()
        );
      }
      
      // Queue screenshot downloads
      const imageFiles = item.files.filter(file => 
        file.name.toLowerCase().match(/\.(png|jpg|jpeg)$/i) &&
        file.name.toLowerCase().includes('screenshot')
      );
      
      for (const imageFile of imageFiles.slice(0, 1)) { // Take first screenshot
        const downloadUrl = `https://archive.org/download/${item.identifier}/${imageFile.name}`;
        const localPath = path.join(levelDir, 'screenshot_original.png');
        
        downloads.push(
          (async () => {
            this.activeDownloads++;
            try {
              await this.downloadFile(downloadUrl, localPath);
              levelFiles.push({
                filename: 'screenshot_original.png',
                path: localPath,
                size: parseInt(imageFile.size) || 0,
                type: 'screenshot' as const
              });
            } catch (error) {
              logger.warn(`Failed to download screenshot ${imageFile.name}:`, error);
            } finally {
              this.activeDownloads--;
              this.completedDownloads++;
            }
          })()
        );
      }
      
      // Wait for all downloads to complete
      await Promise.all(downloads);
      
      const level: Level = {
        metadata,
        files: levelFiles,
        catalogPath: levelDir,
        datFilePath: levelFiles.find(f => f.type === 'dat')?.path || '',
        screenshotPath: levelFiles.find(f => f.type === 'screenshot')?.path,
        indexed: new Date(),
        lastUpdated: new Date()
      };
      
      return level;
      
    } catch (error) {
      logger.error(`Failed to process archive item ${item.identifier}:`, error);
      return null;
    }
  }

  private async downloadFile(url: string, filePath: string, retries: number = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'ManicMinersIndexer/1.0'
          }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (response.body) {
          const fileStream = fs.createWriteStream(filePath);
          await new Promise<void>((resolve, reject) => {
            response.body!.pipe(fileStream);
            response.body!.on('error', reject);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });
          return; // Success!
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          logger.warn(`Download attempt ${attempt} failed for ${url}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }
    
    throw lastError || new Error('Download failed after all retries');
  }

  private async saveLevelData(level: Level): Promise<void> {
    const catalogPath = path.join(level.catalogPath, 'catalog.json');
    await FileUtils.writeJSON(catalogPath, level);
    logger.debug(`Saved level catalog: ${catalogPath}`);
  }
}