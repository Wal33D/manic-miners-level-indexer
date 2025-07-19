import { DuplicateAnalysisReport, MapSource } from '../src/types';
import { FileUtils } from '../src/utils/fileUtils';
import { logger } from '../src/utils/logger';

async function analyzeMetadataQuality() {
  const report = await FileUtils.readJSON<DuplicateAnalysisReport>(
    'output/duplicate-reports/duplicates.json'
  );

  if (!report) {
    logger.error('Could not load duplicate report');
    return;
  }

  const stats = {
    [MapSource.ARCHIVE]: {
      total: 0,
      hasDescription: 0,
      hasTags: 0,
      hasAuthor: 0,
      hasFormatVersion: 0,
    },
    [MapSource.DISCORD]: {
      total: 0,
      hasDescription: 0,
      hasTags: 0,
      hasAuthor: 0,
      hasFormatVersion: 0,
    },
    [MapSource.HOGNOSE]: {
      total: 0,
      hasDescription: 0,
      hasTags: 0,
      hasAuthor: 0,
      hasFormatVersion: 0,
    },
  };

  // Analyze all levels in duplicate groups
  for (const group of report.duplicateGroups) {
    for (const level of group.levels) {
      const source = level.source;

      if (stats[source]) {
        stats[source].total++;

        if (level.metadata.description) stats[source].hasDescription++;
        if (level.metadata.tags && level.metadata.tags.length > 0) stats[source].hasTags++;
        if (level.metadata.author && level.metadata.author !== 'Unknown') stats[source].hasAuthor++;
        if (level.metadata.formatVersion && level.metadata.formatVersion !== 'unknown') {
          stats[source].hasFormatVersion++;
        }
      }
    }
  }

  // Display results
  logger.info('\n📊 Metadata Quality Analysis for Duplicate Levels:\n');

  for (const [source, data] of Object.entries(stats)) {
    if (data.total === 0) continue;

    logger.info(`${source.toUpperCase()}:`);
    logger.info(`  Total levels: ${data.total}`);
    logger.info(
      `  Has description: ${data.hasDescription} (${((data.hasDescription / data.total) * 100).toFixed(1)}%)`
    );
    logger.info(`  Has tags: ${data.hasTags} (${((data.hasTags / data.total) * 100).toFixed(1)}%)`);
    logger.info(
      `  Has author: ${data.hasAuthor} (${((data.hasAuthor / data.total) * 100).toFixed(1)}%)`
    );
    logger.info(
      `  Has format version: ${data.hasFormatVersion} (${((data.hasFormatVersion / data.total) * 100).toFixed(1)}%)`
    );
    logger.info('');
  }

  // Check specific examples
  logger.info('📋 Sample Comparison (first 5 duplicate groups):\n');

  for (let i = 0; i < Math.min(5, report.duplicateGroups.length); i++) {
    const group = report.duplicateGroups[i];
    logger.info(`Group ${i + 1}: "${group.levels[0].title}"`);

    for (const level of group.levels) {
      const meta = level.metadata;
      const quality = {
        desc: meta.description ? '✓' : '✗',
        tags: meta.tags && meta.tags.length > 0 ? `✓(${meta.tags.length})` : '✗',
        author: meta.author !== 'Unknown' ? '✓' : '✗',
        format: meta.formatVersion !== 'unknown' ? '✓' : '✗',
      };

      logger.info(
        `  [${level.source}] Desc:${quality.desc} Tags:${quality.tags} Author:${quality.author} Format:${quality.format}`
      );
    }
    logger.info('');
  }
}

analyzeMetadataQuality().catch(error => {
  logger.error('Error analyzing metadata:', error);
  process.exit(1);
});
