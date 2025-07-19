import { DuplicateAnalysisReport, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { DuplicateAnalyzer } from '../src/utils/duplicateAnalyzer';
import { logger } from '../src/utils/logger';

async function analyzeRecommendationScores() {
  const report = await FileUtils.readJSON<DuplicateAnalysisReport>(
    'output/duplicate-reports/duplicates.json'
  );

  if (!report) {
    logger.error('Could not load duplicate report');
    return;
  }

  logger.info('\n🔍 Analyzing Recommendation Scoring:\n');

  // Analyze first few groups in detail
  for (let i = 0; i < Math.min(3, report.duplicateGroups.length); i++) {
    const group = report.duplicateGroups[i];
    logger.info(`\nGroup ${i + 1}: "${group.levels[0].title}"`);

    // Calculate scores for each level
    const scores = group.levels.map(level => {
      let score = 0;
      const breakdown: string[] = [];

      // Check each scoring criterion
      if (level.metadata.description) {
        score += 2;
        breakdown.push('description(+2)');
      }

      if (level.metadata.tags && level.metadata.tags.length > 0) {
        score += 1;
        breakdown.push(`tags(+1)`);
      }

      if (level.metadata.author && level.metadata.author !== 'Unknown') {
        score += 1;
        breakdown.push('author(+1)');
      }

      if (level.metadata.formatVersion && level.metadata.formatVersion !== 'unknown') {
        score += 1;
        breakdown.push('format(+1)');
      }

      if (level.uploadDate) {
        const ageInDays =
          (Date.now() - new Date(level.uploadDate).getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays < 365) {
          score += 1;
          breakdown.push('recent(+1)');
        }
      }

      if (level.source === 'discord') {
        score += 1;
        breakdown.push('discord-bonus(+1)');
      }

      return { level, score, breakdown };
    });

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    // Display scores
    for (const { level, score, breakdown } of scores) {
      const isRecommended = level.id === DuplicateAnalyzer.recommendBestDuplicate(group);
      const marker = isRecommended ? '⭐' : '  ';
      logger.info(`${marker} [${level.source}] Score: ${score} - ${breakdown.join(', ')}`);
      logger.info(
        `    Upload: ${level.uploadDate ? new Date(level.uploadDate).toLocaleDateString() : 'unknown'}`
      );
    }
  }

  // Summary statistics
  logger.info('\n📊 Recommendation Summary:\n');

  const recommendations = {
    [MapSource.ARCHIVE]: 0,
    [MapSource.DISCORD]: 0,
    [MapSource.HOGNOSE]: 0,
  };

  for (const group of report.duplicateGroups) {
    const recommendedId = DuplicateAnalyzer.recommendBestDuplicate(group);
    const recommended = group.levels.find(l => l.id === recommendedId);
    if (recommended && recommended.source !== MapSource.MERGED) {
      recommendations[recommended.source]++;
    }
  }

  logger.info(`Total duplicate groups: ${report.duplicateGroups.length}`);
  for (const [source, count] of Object.entries(recommendations)) {
    const percentage = ((count / report.duplicateGroups.length) * 100).toFixed(1);
    logger.info(`${source}: ${count} recommendations (${percentage}%)`);
  }
}

analyzeRecommendationScores().catch(error => {
  logger.error('Error analyzing scores:', error);
  process.exit(1);
});
