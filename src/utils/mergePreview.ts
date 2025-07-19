import { DuplicateGroup } from '../types';
import { MetadataMerger } from './metadataMerger';
import chalk from 'chalk';

export class MergePreview {
  /**
   * Generate a preview of what will be merged
   */
  static generatePreview(group: DuplicateGroup): string {
    const lines: string[] = [];

    // Header
    lines.push(chalk.yellow(`\n🔀 Merge Preview (${group.levels.length} sources):`));
    lines.push(`  Hash: ${group.hash.substring(0, 16)}...`);
    lines.push(`  File Size: ${(group.fileSize / 1024).toFixed(1)} KB`);

    // What each source contributes
    lines.push(chalk.cyan('\n  Metadata Contributions:'));

    const archiveLevel = group.levels.find(l => l.source === 'archive');
    const discordLevel = group.levels.find(l => l.source === 'discord');

    if (archiveLevel) {
      lines.push(chalk.gray('  From Archive.org:'));
      lines.push(
        `    ✓ Professional description (${archiveLevel.metadata.description?.length || 0} chars)`
      );
      lines.push(
        `    ✓ Clean title format: "${archiveLevel.title.replace(' | Manic Miners custom level', '')}"`
      );
      if (archiveLevel.author !== 'Unknown') {
        lines.push(`    ✓ Proper author casing: "${archiveLevel.author}"`);
      }
    }

    if (discordLevel) {
      lines.push(chalk.gray('  From Discord:'));
      lines.push(
        `    ✓ Accurate upload date: ${new Date(discordLevel.uploadDate!).toLocaleDateString()}`
      );
      if (
        discordLevel.metadata.description &&
        !discordLevel.metadata.description.startsWith('Level shared on Discord by')
      ) {
        lines.push(`    ✓ Author's notes (${discordLevel.metadata.description.length} chars)`);
      }
      lines.push(`    ✓ Community link: ${discordLevel.metadata.sourceUrl}`);
    }

    // Preview merged result
    lines.push(chalk.green('\n  Merged Result:'));
    const merged = MetadataMerger.mergeDuplicateGroup(group);
    lines.push(`    Title: "${merged.title}"`);
    lines.push(`    Author: ${merged.author}`);
    lines.push(`    Upload Date: ${new Date(merged.postedDate).toLocaleDateString()}`);
    if (merged.authorNotes) {
      lines.push(`    Has Author Notes: Yes`);
    }
    lines.push(`    Combined Tags: ${merged.tags?.length || 0}`);

    return lines.join('\n');
  }

  /**
   * Format duplicate group for merge-aware display
   */
  static formatDuplicateGroupForMerge(group: DuplicateGroup): string {
    const lines: string[] = [
      `\nDuplicate Group (${group.levels.length} copies to merge):`,
      `  Hash: ${group.hash}`,
      `  File Size: ${(group.fileSize / 1024).toFixed(1)} KB`,
      `  Sources to merge:`,
    ];

    // Sort levels by source for consistent display
    const sortedLevels = [...group.levels].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.title.localeCompare(b.title);
    });

    for (const level of sortedLevels) {
      const uploadDate = level.uploadDate
        ? new Date(level.uploadDate).toLocaleDateString()
        : 'unknown date';

      lines.push(
        `    - [${level.source.toUpperCase()}] "${level.title}" by ${level.author} (${uploadDate})`
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate a summary of merge benefits
   */
  static getMergeBenefitsSummary(): string {
    return chalk.blue(`
📋 Merge Benefits:
  • Combines professional descriptions from Archive.org
  • Preserves accurate timestamps from Discord
  • Keeps author's original notes and community context
  • Eliminates duplicate files while preserving all metadata
  • Creates single source of truth for each level
`);
  }
}
