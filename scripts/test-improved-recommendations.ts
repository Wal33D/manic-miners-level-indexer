import { DuplicateAnalysisReport, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { DuplicateAnalyzer } from '../src/utils/duplicateAnalyzer';
import { ImprovedDuplicateAnalyzer } from '../src/utils/duplicateAnalyzerImproved';
import { logger } from '../src/utils/logger';

async function testImprovedRecommendations() {
  const report = await FileUtils.readJSON<DuplicateAnalysisReport>(
    'output/duplicate-reports/duplicates.json'
  );

  if (!report) {
    logger.error('Could not load duplicate report');
    return;
  }

  logger.info('\n🔄 Comparing Original vs Improved Recommendations:\n');

  // Compare first few groups
  for (let i = 0; i < Math.min(5, report.duplicateGroups.length); i++) {
    const group = report.duplicateGroups[i];
    logger.info(`\nGroup ${i + 1}: "${group.levels[0].title}"`);

    // Get recommendations from both algorithms
    const originalRec = DuplicateAnalyzer.recommendBestDuplicate(group);
    const improvedRec = ImprovedDuplicateAnalyzer.recommendBestDuplicate(group);

    const originalLevel = group.levels.find(l => l.id === originalRec);
    const improvedLevel = group.levels.find(l => l.id === improvedRec);

    logger.info('Levels in group:');
    for (const level of group.levels) {
      const markers = [];
      if (level.id === originalRec) markers.push('ORIG');
      if (level.id === improvedRec) markers.push('NEW');
      const markerStr = markers.length > 0 ? `[${markers.join(',')}]` : '';

      logger.info(
        `  ${markerStr} [${level.source}] ${level.author} - Upload: ${
          level.uploadDate ? new Date(level.uploadDate).toLocaleDateString() : 'unknown'
        }`
      );
    }

    if (originalRec !== improvedRec) {
      logger.info(
        `  ⚠️  Recommendation changed from ${originalLevel?.source} to ${improvedLevel?.source}`
      );
    }
  }

  // Overall statistics
  logger.info('\n📊 Overall Recommendation Changes:\n');

  const origRecs = {
    [MapSource.ARCHIVE]: 0,
    [MapSource.DISCORD]: 0,
    [MapSource.HOGNOSE]: 0,
  };
  const improvedRecs = {
    [MapSource.ARCHIVE]: 0,
    [MapSource.DISCORD]: 0,
    [MapSource.HOGNOSE]: 0,
  };
  let changedCount = 0;

  for (const group of report.duplicateGroups) {
    const originalRec = DuplicateAnalyzer.recommendBestDuplicate(group);
    const improvedRec = ImprovedDuplicateAnalyzer.recommendBestDuplicate(group);

    const originalLevel = group.levels.find(l => l.id === originalRec);
    const improvedLevel = group.levels.find(l => l.id === improvedRec);

    if (originalLevel) origRecs[originalLevel.source]++;
    if (improvedLevel) improvedRecs[improvedLevel.source]++;

    if (originalRec !== improvedRec) changedCount++;
  }

  logger.info('Original algorithm:');
  for (const [source, count] of Object.entries(origRecs)) {
    logger.info(
      `  ${source}: ${count} (${((count / report.duplicateGroups.length) * 100).toFixed(1)}%)`
    );
  }

  logger.info('\nImproved algorithm:');
  for (const [source, count] of Object.entries(improvedRecs)) {
    logger.info(
      `  ${source}: ${count} (${((count / report.duplicateGroups.length) * 100).toFixed(1)}%)`
    );
  }

  logger.info(
    `\nTotal recommendations changed: ${changedCount} out of ${report.duplicateGroups.length} (${((changedCount / report.duplicateGroups.length) * 100).toFixed(1)}%)`
  );
}

testImprovedRecommendations().catch(error => {
  logger.error('Error testing recommendations:', error);
  process.exit(1);
});
