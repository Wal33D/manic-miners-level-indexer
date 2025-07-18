import { InternetArchiveIndexer } from '../../src/indexers/archive/InternetArchiveIndexer';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';
import { TestPaths } from '../../src/tests/test-config';
import { getSourceLevelsDir } from '../../src/utils/sourceUtils';
import { MapSource } from '../../src/types';
import { OutputValidator } from '../../src/tests/outputValidator';
import { AnalysisReporter } from '../../src/tests/analysisReporter';

async function testArchiveIndexer() {
  const outputDir = TestPaths.integration.archive;
  const config = {
    enabled: true,
    baseUrl: 'https://archive.org',
    searchQueries: ['manic miners level'],
    maxConcurrentMetadata: 3,
    maxConcurrentDownloads: 2,
    skipExisting: false,
  };

  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  logger.info('Starting Archive.org indexer test...');
  logger.info('Output directory:', outputDir);
  logger.info('Search queries:', config.searchQueries);

  const indexer = new InternetArchiveIndexer(config, outputDir);

  // Limit to 20 items for quick testing
  const MAX_ITEMS = 20;
  let itemsProcessed = 0;

  // Monkey patch to limit items
  type ProcessItemFn = (metadata: unknown) => Promise<boolean>;
  const originalProcessCompleteItem = (indexer as unknown as { processCompleteItem: ProcessItemFn })
    .processCompleteItem;
  (indexer as unknown as { processCompleteItem: ProcessItemFn }).processCompleteItem =
    async function (metadata: unknown) {
      if (itemsProcessed >= MAX_ITEMS) {
        logger.info(`Skipping item (reached limit of ${MAX_ITEMS})`);
        return false;
      }
      const result = await originalProcessCompleteItem.apply(this, [metadata]);
      if (result) {
        itemsProcessed++;
      }
      return result;
    };

  const startTime = Date.now();

  const result = await indexer.indexArchive(progress => {
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
  const levelsDir = path.join(outputDir, getSourceLevelsDir(MapSource.ARCHIVE));
  if (await fs.pathExists(levelsDir)) {
    const allEntries = await fs.readdir(levelsDir);
    // Filter out non-directories
    const levelDirs: string[] = [];
    for (const entry of allEntries) {
      const entryPath = path.join(levelsDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        levelDirs.push(entry);
      }
    }
    logger.info(`\nCreated ${levelDirs.length} level directories`);

    // Sample check of levels
    logger.info(`\nAnalyzing downloaded levels:`);

    for (const levelDir of levelDirs) {
      const levelPath = path.join(levelsDir, levelDir);
      const files = await fs.readdir(levelPath);
      const catalogPath = path.join(levelPath, 'catalog.json');

      if (await fs.pathExists(catalogPath)) {
        const catalog = await fs.readJSON(catalogPath);
        logger.info(`\n- ${catalog.metadata.title} by ${catalog.metadata.author}`);
        logger.info(`  Files: ${files.length}`);
        logger.info(`  Format: ${catalog.metadata.formatVersion || 'unknown'}`);
        logger.info(`  Source URL: ${catalog.metadata.sourceUrl}`);

        // Check for images
        const hasScreenshot = files.some(f => f.includes('screenshot'));
        const hasThumbnail = files.some(f => f.includes('thumbnail'));
        logger.info(
          `  Images: ${hasScreenshot ? '✓ screenshot' : '✗ screenshot'}, ${hasThumbnail ? '✓ thumbnail' : '✗ thumbnail'}`
        );

        // Check file sizes
        let totalSize = 0;
        for (const file of files) {
          const filePath = path.join(levelPath, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          if (file.endsWith('.dat')) {
            logger.info(`  DAT file: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
          }
        }
        logger.info(`  Total size: ${(totalSize / 1024).toFixed(1)} KB`);
      }
    }
  }

  // Validate output
  logger.info('\n=== Validating Output ===');
  const validator = new OutputValidator();
  const { results, summary } = await validator.validateDirectory(outputDir, MapSource.ARCHIVE);

  logger.info(validator.formatSummary(summary));

  // Generate analysis report
  logger.info('\n=== Generating Analysis Report ===');
  const reporter = new AnalysisReporter();
  const report = await reporter.analyzeOutput(outputDir, results);

  logger.info(`Data quality score: ${report.dataQuality.completenessScore}%`);
  logger.info(`Total size: ${(report.totalSize / 1024).toFixed(1)} KB`);

  if (report.recommendations.length > 0) {
    logger.info('\nRecommendations:');
    report.recommendations.forEach(rec => logger.info(`- ${rec}`));
  }

  // Save reports
  const reportsDir = path.join(outputDir, 'reports');
  await fs.ensureDir(reportsDir);

  await reporter.generateHTMLReport(report, path.join(reportsDir, 'analysis.html'));
  await reporter.generateJSONReport(report, path.join(reportsDir, 'analysis.json'));

  logger.info(`\nReports saved to: ${reportsDir}`);

  // Rebuild catalog index
  logger.info('\nRebuilding catalog index...');
  const { CatalogManager } = await import('../../src/catalog/catalogManager');
  const catalogManager = new CatalogManager(outputDir);
  await catalogManager.rebuildCatalogIndex();

  const allLevels = await catalogManager.getAllLevels();
  logger.info(`Total levels in catalog: ${allLevels.length}`);
}

// Run the test
testArchiveIndexer().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
