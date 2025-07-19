import { DuplicateGroup, MapSource } from '../types';

export class ImprovedDuplicateAnalyzer {
  /**
   * Get recommendation for which duplicate to keep - improved version
   */
  static recommendBestDuplicate(group: DuplicateGroup): string {
    // Score each level based on metadata quality
    const scores = group.levels.map(level => {
      let score = 0;
      const factors: string[] = [];

      // Metadata completeness (most important)
      if (level.metadata.description) {
        score += 2;
        factors.push('has description');
      }

      if (level.metadata.tags && level.metadata.tags.length > 0) {
        score += level.metadata.tags.length * 0.5; // More tags = better
        factors.push(`${level.metadata.tags.length} tags`);
      }

      if (level.metadata.author && level.metadata.author !== 'Unknown') {
        score += 1;
        factors.push('known author');
      }

      if (level.metadata.formatVersion && level.metadata.formatVersion !== 'unknown') {
        score += 1;
        factors.push('has format version');
      }

      // Additional metadata bonuses
      if (level.metadata.difficulty) {
        score += 0.5;
        factors.push('has difficulty');
      }

      if (level.metadata.objectives && level.metadata.objectives.length > 0) {
        score += 0.5;
        factors.push('has objectives');
      }

      // Prefer the original/earliest upload (likely the author's upload)
      if (level.uploadDate) {
        const ageInDays =
          (Date.now() - new Date(level.uploadDate).getTime()) / (1000 * 60 * 60 * 24);
        // Give bonus to the earliest upload (likely original)
        const earliestDate = Math.min(
          ...group.levels.filter(l => l.uploadDate).map(l => new Date(l.uploadDate!).getTime())
        );

        if (new Date(level.uploadDate).getTime() === earliestDate) {
          score += 1;
          factors.push('earliest upload');
        }
      }

      // Source-specific considerations (without bias)
      // Archive.org often has better preservation metadata
      if (level.source === MapSource.ARCHIVE && level.metadata.sourceUrl) {
        score += 0.5;
        factors.push('has archive URL');
      }

      // Hognose has curated, tested levels
      if (level.source === MapSource.HOGNOSE) {
        score += 0.5;
        factors.push('curated/tested');
      }

      return { level, score, factors };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // If there's a tie, prefer the earliest upload
    if (scores.length > 1 && scores[0].score === scores[1].score) {
      const tied = scores.filter(s => s.score === scores[0].score);
      tied.sort((a, b) => {
        const dateA = a.level.uploadDate ? new Date(a.level.uploadDate).getTime() : Infinity;
        const dateB = b.level.uploadDate ? new Date(b.level.uploadDate).getTime() : Infinity;
        return dateA - dateB;
      });
      return tied[0].level.id;
    }

    return scores[0].level.id;
  }
}
