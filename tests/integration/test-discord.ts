import { DiscordUnifiedIndexer } from '../../src/indexers/discordUnified';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';
import { TestPaths } from '../../src/tests/test-config';
import { getSourceLevelsDir } from '../../src/utils/sourceUtils';
import { MapSource } from '../../src/types';
import { OutputValidator } from '../../src/tests/outputValidator';
import { AnalysisReporter } from '../../src/tests/analysisReporter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDiscordIndexer() {
  const outputDir = TestPaths.integration.discord;
  const channels = [
    '683985075704299520', // Old pre-v1 maps
    '1139908458968252457', // Community levels (v1+)
  ];

  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  logger.info('Starting Discord indexer test...');
  logger.info('Output directory:', outputDir);
  logger.info('Channels to index:');
  logger.info('  - 683985075704299520 (Old pre-v1 maps)');
  logger.info('  - 1139908458968252457 (Community levels v1+)');

  const indexer = new DiscordUnifiedIndexer(channels, outputDir);

  const startTime = Date.now();

  const result = await indexer.indexDiscord(progress => {
    logger.info(`[${progress.phase}] ${progress.message} - ${progress.current}/${progress.total}`);
  });

  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = ((duration % 60000) / 1000).toFixed(1);

  logger.info('\n=== Test Results ===');
  logger.info(`Success: ${result.success}`);
  logger.info(`Total time: ${minutes}m ${seconds}s`);
  logger.info(`Levels processed: ${result.levelsProcessed}`);
  logger.info(`Levels skipped: ${result.levelsSkipped}`);
  logger.info(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    logger.warn('\nFirst 5 errors:');
    result.errors.slice(0, 5).forEach(err => logger.warn(`- ${err}`));
  }

  // Check what was downloaded
  const levelsDir = path.join(outputDir, getSourceLevelsDir(MapSource.DISCORD));
  if (await fs.pathExists(levelsDir)) {
    const allEntries = await fs.readdir(levelsDir);
    // Filter out non-directories like .DS_Store
    const levelDirs: string[] = [];
    for (const entry of allEntries) {
      const entryPath = path.join(levelsDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        levelDirs.push(entry);
      }
    }
    logger.info(`\nCreated ${levelDirs.length} level directories`);

    // Sample check of first few levels
    const sampleSize = Math.min(5, levelDirs.length);
    logger.info(`\nSample of first ${sampleSize} levels:`);

    for (let i = 0; i < sampleSize; i++) {
      const levelDir = path.join(levelsDir, levelDirs[i]);
      const files = await fs.readdir(levelDir);
      const catalogPath = path.join(levelDir, 'catalog.json');

      if (await fs.pathExists(catalogPath)) {
        const catalog = await fs.readJSON(catalogPath);
        logger.info(
          `- ${catalog.metadata.title} by ${catalog.metadata.author}: ${files.length} files`
        );
      }
    }
  }

  // Validate output using shared validator
  logger.info('\n=== Validating Output ===');
  const validator = new OutputValidator();
  const { results, summary } = await validator.validateDirectory(outputDir, MapSource.DISCORD);

  logger.info(validator.formatSummary(summary));

  // Generate analysis report
  logger.info('\n=== Generating Analysis ===');
  const reporter = new AnalysisReporter();
  const report = await reporter.analyzeOutput(outputDir, results);

  logger.info(`Data quality score: ${report.dataQuality.completenessScore}%`);
  logger.info(`Unique authors: ${report.statistics.byAuthor.size}`);

  if (report.recommendations.length > 0) {
    logger.info('\nRecommendations:');
    report.recommendations.forEach(rec => logger.info(`- ${rec}`));
  }

  // Save analysis report
  const reportsDir = path.join(outputDir, 'reports');
  await fs.ensureDir(reportsDir);
  await reporter.generateHTMLReport(report, path.join(reportsDir, 'discord-analysis.html'));
  logger.info(`\nAnalysis report saved to: ${path.join(reportsDir, 'discord-analysis.html')}`);

  // Rebuild catalog index to make levels accessible via CatalogManager
  logger.info('\nRebuilding catalog index...');
  const { CatalogManager } = await import('../../src/catalog/catalogManager');
  const catalogManager = new CatalogManager(outputDir);
  await catalogManager.rebuildCatalogIndex();

  const allLevels = await catalogManager.getAllLevels();
  logger.info(`Total levels in catalog: ${allLevels.length}`);
}

// Run the test
testDiscordIndexer().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
