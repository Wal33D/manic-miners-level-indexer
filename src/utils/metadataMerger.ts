import { Level, LevelMetadata, MapSource, DuplicateGroup } from '../types';
import { logger } from './logger';

export interface MergedMetadata extends LevelMetadata {
  authorNotes?: string;
  sources: {
    archive?: {
      url: string;
      uploadDate: Date;
      id: string;
    };
    discord?: {
      url: string;
      uploadDate: Date;
      channelId: string;
      messageId: string;
    };
  };
  mergedFrom: string[];
}

export class MetadataMerger {
  /**
   * Merge metadata from duplicate levels across different sources
   */
  static mergeDuplicateGroup(group: DuplicateGroup): MergedMetadata {
    // Separate levels by source
    const levelsBySource: Record<MapSource, typeof group.levels> = {
      [MapSource.ARCHIVE]: [],
      [MapSource.DISCORD]: [],
      [MapSource.HOGNOSE]: [],
      [MapSource.MERGED]: [],
    };

    group.levels.forEach(level => {
      levelsBySource[level.source].push(level);
    });

    // Get the best metadata from each source
    const archiveLevel = levelsBySource[MapSource.ARCHIVE][0];
    const discordLevel = levelsBySource[MapSource.DISCORD][0];

    // Start with base metadata - prefer Discord for accurate dates
    const baseLevel = discordLevel || archiveLevel || group.levels[0];

    // Create merged metadata
    const merged: MergedMetadata = {
      // Basic info - use the first available
      id: `merged-${group.hash.substring(0, 8)}`,
      title: this.selectBestTitle(group.levels),
      author: this.selectBestAuthor(group.levels),

      // Use Archive's rich description if available
      description: archiveLevel?.metadata.description || baseLevel.metadata.description || '',

      // Use Discord's upload date (more accurate than Archive's batch date)
      postedDate: discordLevel ? new Date(discordLevel.uploadDate!) : baseLevel.metadata.postedDate,

      // Merge unique tags from all sources
      tags: this.mergeUniqueTags(group.levels),

      // Take best available metadata
      objectives: this.findFirstAvailable(group.levels, l => l.metadata.objectives),
      requirements: this.findFirstAvailable(group.levels, l => l.metadata.requirements),
      difficulty: this.findFirstAvailable(group.levels, l => l.metadata.difficulty),
      rating: this.findFirstAvailable(group.levels, l => l.metadata.rating),
      formatVersion: baseLevel.metadata.formatVersion,
      fileSize: baseLevel.metadata.fileSize,

      // Set source as 'merged'
      source: MapSource.MERGED,

      // Discord author notes if different from main description
      authorNotes: this.extractAuthorNotes(discordLevel, archiveLevel),

      // Track all sources
      sources: this.buildSourcesInfo(group.levels),

      // Track what was merged
      mergedFrom: group.levels.map(l => l.id),
    };

    return merged;
  }

  /**
   * Select the best formatted title
   */
  private static selectBestTitle(levels: DuplicateGroup['levels']): string {
    // Prefer Archive's clean title format
    const archiveLevel = levels.find(l => l.source === MapSource.ARCHIVE);
    if (archiveLevel && archiveLevel.title) {
      // Remove "| Manic Miners custom level" suffix if present
      return archiveLevel.title.replace(' | Manic Miners custom level', '');
    }

    // Otherwise use the first available
    return levels[0].title;
  }

  /**
   * Select the best author name (proper casing)
   */
  private static selectBestAuthor(levels: DuplicateGroup['levels']): string {
    // Prefer Archive's author (usually has proper casing)
    const archiveLevel = levels.find(l => l.source === MapSource.ARCHIVE);
    if (archiveLevel && archiveLevel.author && archiveLevel.author !== 'Unknown') {
      return archiveLevel.author;
    }

    // Find first non-unknown author
    const withAuthor = levels.find(l => l.author && l.author !== 'Unknown');
    return withAuthor?.author || 'Unknown';
  }

  /**
   * Merge unique tags from all sources
   */
  private static mergeUniqueTags(levels: DuplicateGroup['levels']): string[] {
    const allTags = new Set<string>();

    levels.forEach(level => {
      if (level.metadata.tags) {
        level.metadata.tags.forEach(tag => {
          // Skip source-specific tags
          if (!['archive', 'discord', 'hognose', 'internet-archive', 'community'].includes(tag)) {
            allTags.add(tag);
          }
        });
      }
    });

    return Array.from(allTags);
  }

  /**
   * Find first available value from levels
   */
  private static findFirstAvailable<T>(
    levels: DuplicateGroup['levels'],
    selector: (level: DuplicateGroup['levels'][0]) => T | undefined
  ): T | undefined {
    for (const level of levels) {
      const value = selector(level);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Extract Discord author notes if different from Archive description
   */
  private static extractAuthorNotes(
    discordLevel?: DuplicateGroup['levels'][0],
    archiveLevel?: DuplicateGroup['levels'][0]
  ): string | undefined {
    if (!discordLevel) return undefined;

    const discordDesc = discordLevel.metadata.description;
    const archiveDesc = archiveLevel?.metadata.description;

    // If Discord has a different description (not the generic one)
    if (
      discordDesc &&
      discordDesc !== archiveDesc &&
      !discordDesc.startsWith('Level shared on Discord by')
    ) {
      return discordDesc;
    }

    return undefined;
  }

  /**
   * Build sources information
   */
  private static buildSourcesInfo(levels: DuplicateGroup['levels']): MergedMetadata['sources'] {
    const sources: MergedMetadata['sources'] = {};

    levels.forEach(level => {
      if (level.source === MapSource.ARCHIVE && level.metadata.sourceUrl) {
        sources.archive = {
          url: level.metadata.sourceUrl,
          uploadDate: new Date(level.uploadDate!),
          id: level.metadata.originalId || level.id,
        };
      } else if (level.source === MapSource.DISCORD && level.metadata.sourceUrl) {
        // Extract channel and message IDs from Discord URL
        const urlMatch = level.metadata.sourceUrl.match(/channels\/(\d+)\/(\d+)$/);
        if (urlMatch) {
          sources.discord = {
            url: level.metadata.sourceUrl,
            uploadDate: new Date(level.uploadDate!),
            channelId: urlMatch[1],
            messageId: urlMatch[2],
          };
        }
      }
    });

    return sources;
  }
}
