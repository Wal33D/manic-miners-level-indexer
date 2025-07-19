import { Level, MapSource, DuplicateGroup, DuplicateAnalysisReport, CatalogIndex } from '../types';
import { logger } from './logger';
import { FileUtils } from './fileUtils';
import path from 'path';

export class DuplicateAnalyzer {
  private outputDir: string;
  private hashMap: Map<string, DuplicateGroup> = new Map();
  private statistics = {
    bySource: {
      [MapSource.ARCHIVE]: { total: 0, unique: 0, duplicates: 0 },
      [MapSource.DISCORD]: { total: 0, unique: 0, duplicates: 0 },
      [MapSource.HOGNOSE]: { total: 0, unique: 0, duplicates: 0 },
    },
    crossSourceDuplicates: 0,
    withinSourceDuplicates: 0,
    largestDuplicateGroup: 0,
  };

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Analyze catalog for duplicate levels across all sources
   */
  async analyzeCatalog(catalog?: CatalogIndex): Promise<DuplicateAnalysisReport> {
    logger.info('Starting duplicate analysis...');

    // Load catalog if not provided
    if (!catalog) {
      const catalogPath = path.join(this.outputDir, 'catalog_index.json');
      const loadedCatalog = await FileUtils.readJSON<CatalogIndex>(catalogPath);
      if (!loadedCatalog) {
        throw new Error('Failed to load catalog index');
      }
      catalog = loadedCatalog;
    }

    // Reset state
    this.hashMap.clear();
    this.resetStatistics();

    // Process all levels
    logger.info(`Analyzing ${catalog.levels.length} levels for duplicates...`);
    for (const level of catalog.levels) {
      await this.processLevel(level);
    }

    // Calculate statistics
    const report = this.generateReport(catalog);

    logger.success(`Analysis complete: Found ${report.duplicateGroups.length} duplicate groups`);
    return report;
  }

  /**
   * Process a single level and add to hash map
   */
  private async processLevel(level: Level): Promise<void> {
    // Get the hash from the DAT file
    const datFile = level.files.find(f => f.type === 'dat');
    if (!datFile) {
      logger.warn(`No DAT file found for level: ${level.metadata.id}`);
      return;
    }

    let hash = datFile.hash;
    if (!hash) {
      // If no hash stored, calculate it
      hash = await FileUtils.getFileHash(datFile.path || level.datFilePath);
      if (!hash) {
        logger.warn(`Could not calculate hash for level: ${level.metadata.id}`);
        return;
      }
      datFile.hash = hash;
    }

    const source = level.metadata.source;

    // Update source statistics
    this.statistics.bySource[source].total++;

    // Check if hash already exists
    if (this.hashMap.has(hash)) {
      // Add to existing duplicate group
      const group = this.hashMap.get(hash);
      if (!group) return; // Type guard, shouldn't happen
      group.levels.push({
        id: level.metadata.id,
        source: level.metadata.source,
        title: level.metadata.title,
        author: level.metadata.author,
        path: level.datFilePath,
        uploadDate: level.metadata.postedDate,
        metadata: level.metadata,
      });

      // Update duplicate statistics
      this.statistics.bySource[source].duplicates++;
    } else {
      // Create new group
      this.hashMap.set(hash, {
        hash,
        fileSize: datFile.size,
        levels: [
          {
            id: level.metadata.id,
            source: level.metadata.source,
            title: level.metadata.title,
            author: level.metadata.author,
            path: level.datFilePath,
            uploadDate: level.metadata.postedDate,
            metadata: level.metadata,
          },
        ],
      });
    }
  }

  /**
   * Generate analysis report from processed data
   */
  private generateReport(catalog: CatalogIndex): DuplicateAnalysisReport {
    const duplicateGroups: DuplicateGroup[] = [];
    let crossSourceCount = 0;
    let withinSourceCount = 0;
    let largestGroup = 0;

    // Process hash map to find duplicates
    for (const [hash, group] of this.hashMap) {
      if (group.levels.length > 1) {
        duplicateGroups.push(group);

        // Update largest group
        if (group.levels.length > largestGroup) {
          largestGroup = group.levels.length;
        }

        // Check if cross-source or within-source duplicate
        const sources = new Set(group.levels.map(l => l.source));
        if (sources.size > 1) {
          crossSourceCount++;
        } else {
          withinSourceCount++;
        }
      } else {
        // Unique level
        const source = group.levels[0].source;
        // Only count sources that are in our statistics
        if (
          source === MapSource.ARCHIVE ||
          source === MapSource.DISCORD ||
          source === MapSource.HOGNOSE
        ) {
          this.statistics.bySource[source].unique++;
        }
      }
    }

    // Sort duplicate groups by number of duplicates (descending)
    duplicateGroups.sort((a, b) => b.levels.length - a.levels.length);

    return {
      totalLevels: catalog.levels.length,
      uniqueLevels: this.hashMap.size,
      duplicateCount: catalog.levels.length - this.hashMap.size,
      duplicateGroups,
      statistics: {
        ...this.statistics,
        crossSourceDuplicates: crossSourceCount,
        withinSourceDuplicates: withinSourceCount,
        largestDuplicateGroup: largestGroup,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Reset statistics counters
   */
  private resetStatistics(): void {
    // Reset statistics for original sources only
    this.statistics.bySource[MapSource.ARCHIVE] = { total: 0, unique: 0, duplicates: 0 };
    this.statistics.bySource[MapSource.DISCORD] = { total: 0, unique: 0, duplicates: 0 };
    this.statistics.bySource[MapSource.HOGNOSE] = { total: 0, unique: 0, duplicates: 0 };

    this.statistics.crossSourceDuplicates = 0;
    this.statistics.withinSourceDuplicates = 0;
    this.statistics.largestDuplicateGroup = 0;
  }

  /**
   * Format duplicate group for display
   */
  static formatDuplicateGroup(group: DuplicateGroup): string {
    const lines: string[] = [
      `\nDuplicate Group (${group.levels.length} copies):`,
      `  Hash: ${group.hash}`,
      `  File Size: ${(group.fileSize / 1024).toFixed(1)} KB`,
      `  Copies:`,
    ];

    // Sort levels by source for consistent display
    const sortedLevels = [...group.levels].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.title.localeCompare(b.title);
    });

    for (const level of sortedLevels) {
      lines.push(
        `    - [${level.source}] "${level.title}" by ${level.author} (${
          level.uploadDate ? new Date(level.uploadDate).toLocaleDateString() : 'unknown date'
        })`
      );
    }

    return lines.join('\n');
  }

  /**
   * Get recommendation for which duplicate to keep
   */
  static recommendBestDuplicate(group: DuplicateGroup): string {
    // Score each level based on metadata quality
    const scores = group.levels.map(level => {
      let score = 0;

      // Prefer levels with more complete metadata
      if (level.metadata.description) score += 2;
      if (level.metadata.tags && level.metadata.tags.length > 0) score += 1;
      if (level.metadata.author && level.metadata.author !== 'Unknown') score += 1;
      if (level.metadata.formatVersion && level.metadata.formatVersion !== 'unknown') score += 1;

      // Prefer newer uploads (more likely to have better metadata)
      if (level.uploadDate) {
        const ageInDays =
          (Date.now() - new Date(level.uploadDate).getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays < 365) score += 1; // Less than a year old
      }

      // No source preference - we'll merge the best from each

      return { level, score };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return scores[0].level.id;
  }
}
