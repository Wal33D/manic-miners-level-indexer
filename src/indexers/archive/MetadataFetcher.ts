import fetch from 'node-fetch';
import xml2js from 'xml2js';
import { logger } from '../../utils/logger';
import { FileUtils } from '../../utils/fileUtils';
import path from 'path';
import { ArchiveMetadata, ArchiveItemDetails, ArchiveSearchOptions } from './types';

// XML response types
interface XMLStringNode {
  $: { name: string };
  _: string;
}

interface XMLDocNode {
  str?: XMLStringNode[];
}

export class MetadataFetcher {
  private baseUrl = 'https://archive.org';
  private cacheDir: string;
  private cacheExpiry: number;
  private enableCache: boolean;

  constructor(outputDir: string, enableCache = true, cacheExpiry = 86400) {
    this.cacheDir = path.join(outputDir, '.cache', 'metadata');
    this.enableCache = enableCache;
    this.cacheExpiry = cacheExpiry * 1000; // Convert to milliseconds
  }

  async *fetchWithScrapeAPI(
    options: ArchiveSearchOptions
  ): AsyncGenerator<ArchiveMetadata[], void, unknown> {
    const { queries, dateRange, fields, maxResults } = options;

    // Build search query
    let query = queries.join(' OR ');
    if (dateRange) {
      query += ` AND date:[${dateRange.from} TO ${dateRange.to}]`;
    }

    // Use the traditional advancedsearch.php endpoint with XML output
    const baseParams = {
      q: query,
      fl: fields?.join(',') || 'identifier,title,creator,date,description',
      rows: '999', // Max rows per page
      output: 'xml',
    };

    let page = 1;
    let totalFetched = 0;
    let hasMore = true;

    while (hasMore && (!maxResults || totalFetched < maxResults)) {
      const params = new URLSearchParams({
        ...baseParams,
        page: page.toString(),
      });

      const url = `${this.baseUrl}/advancedsearch.php?${params}`;
      logger.debug(`Fetching from archive.org: ${url}`);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ManicMinersIndexer/2.0',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const xmlData = await response.text();
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlData);

        // Check if we have results
        const resultNode = result?.response?.result?.[0];
        if (!resultNode || !resultNode.doc) {
          logger.info(`No results found on page ${page}`);
          hasMore = false;
          break;
        }

        const docs = Array.isArray(resultNode.doc) ? resultNode.doc : [resultNode.doc];
        const items: ArchiveMetadata[] = [];

        // Parse XML response into our metadata format
        for (const doc of docs) {
          const getStrValue = (name: string): string => {
            const docTyped = doc as XMLDocNode;
            const strArray = docTyped.str || [];
            const found = strArray.find((s: XMLStringNode) => s.$ && s.$.name === name);
            return found ? found._ : '';
          };

          const item: ArchiveMetadata = {
            identifier: getStrValue('identifier'),
            title: getStrValue('title'),
            creator: getStrValue('creator'),
            date: getStrValue('date'),
            description: getStrValue('description'),
          };

          if (item.identifier && item.title) {
            items.push(item);
          }
        }

        // Apply max results limit
        let itemsToYield = items;
        if (maxResults && totalFetched + items.length > maxResults) {
          itemsToYield = items.slice(0, maxResults - totalFetched);
          hasMore = false;
        }

        totalFetched += itemsToYield.length;
        logger.info(
          `Fetched ${itemsToYield.length} items from page ${page} (total: ${totalFetched})`
        );

        yield itemsToYield;

        // Check if we got less than requested (meaning we're at the end)
        if (docs.length < 999) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error) {
        logger.error(`Failed to fetch page ${page}:`, error);
        throw error;
      }
    }
  }

  async fetchItemDetails(identifier: string): Promise<ArchiveItemDetails | null> {
    // Check cache first
    if (this.enableCache) {
      const cached = await this.getCachedMetadata(identifier);
      if (cached) {
        logger.debug(`Using cached metadata for ${identifier}`);
        return cached;
      }
    }

    const url = `${this.baseUrl}/metadata/${identifier}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ManicMinersIndexer/2.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn(`Item not found: ${identifier}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ArchiveItemDetails = (await response.json()) as ArchiveItemDetails;

      // Cache the result
      if (this.enableCache && data) {
        await this.cacheMetadata(identifier, data);
      }

      return data;
    } catch (error) {
      logger.error(`Failed to fetch details for ${identifier}:`, error);
      return null;
    }
  }

  async fetchItemDetailsBatch(identifiers: string[]): Promise<Map<string, ArchiveItemDetails>> {
    const results = new Map<string, ArchiveItemDetails>();

    // Check cache for all items first
    const toFetch: string[] = [];

    if (this.enableCache) {
      for (const id of identifiers) {
        const cached = await this.getCachedMetadata(id);
        if (cached) {
          results.set(id, cached);
        } else {
          toFetch.push(id);
        }
      }
      logger.debug(`Found ${results.size} cached items, need to fetch ${toFetch.length}`);
    } else {
      toFetch.push(...identifiers);
    }

    // Fetch remaining items in parallel
    if (toFetch.length > 0) {
      const batchSize = 20;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(async id => {
            const details = await this.fetchItemDetails(id);
            return { id, details };
          })
        );

        for (const { id, details } of batchResults) {
          if (details) {
            results.set(id, details);
          }
        }

        logger.info(
          `Fetched details for ${Math.min(i + batchSize, toFetch.length)}/${toFetch.length} items`
        );
      }
    }

    return results;
  }

  private async getCachedMetadata(identifier: string): Promise<ArchiveItemDetails | null> {
    try {
      const cacheFile = path.join(this.cacheDir, `${identifier}.json`);
      const exists = await FileUtils.fileExists(cacheFile);

      if (!exists) {
        return null;
      }

      const stats = await FileUtils.getFileStats(cacheFile);
      const age = Date.now() - stats.mtime.getTime();

      if (age > this.cacheExpiry) {
        logger.debug(`Cache expired for ${identifier}`);
        return null;
      }

      return await FileUtils.readJSON<ArchiveItemDetails>(cacheFile);
    } catch (error) {
      logger.warn(`Failed to read cache for ${identifier}:`, error);
      return null;
    }
  }

  private async cacheMetadata(identifier: string, data: ArchiveItemDetails): Promise<void> {
    try {
      await FileUtils.ensureDir(this.cacheDir);
      const cacheFile = path.join(this.cacheDir, `${identifier}.json`);
      await FileUtils.writeJSON(cacheFile, data);
    } catch (error) {
      logger.warn(`Failed to cache metadata for ${identifier}:`, error);
    }
  }

  async clearCache(): Promise<void> {
    try {
      await FileUtils.deleteFile(this.cacheDir);
      logger.info('Metadata cache cleared');
    } catch (error) {
      logger.warn('Failed to clear cache:', error);
    }
  }
}
