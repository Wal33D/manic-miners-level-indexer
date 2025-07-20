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

  constructor(outputDir: string) {
    // Cache functionality has been removed
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
    // Cache functionality has been removed

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

      // Cache functionality has been removed

      return data;
    } catch (error) {
      logger.error(`Failed to fetch details for ${identifier}:`, error);
      return null;
    }
  }

  async fetchItemDetailsBatch(identifiers: string[]): Promise<Map<string, ArchiveItemDetails>> {
    const results = new Map<string, ArchiveItemDetails>();

    // Fetch all items
    const toFetch: string[] = [...identifiers];

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
}
