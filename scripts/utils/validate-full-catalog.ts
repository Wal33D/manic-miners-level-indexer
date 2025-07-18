import { OutputValidator, ValidationResult } from '../../src/tests/outputValidator';
import { AnalysisReporter } from '../../src/tests/analysisReporter';
import { MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function validateFullCatalog() {
  const outputDir = './output';

  logger.info('=== Validating Full Manic Miners Catalog ===\n');

  // Check if catalog exists
  const catalogPath = path.join(outputDir, 'catalog_index.json');
  const masterPath = path.join(outputDir, 'master_index.json');

  if (!(await fs.pathExists(catalogPath))) {
    logger.error('Catalog index not found!');
    return;
  }

  if (!(await fs.pathExists(masterPath))) {
    logger.error('Master index not found!');
    return;
  }

  // Read master index
  const masterIndex = await fs.readJSON(masterPath);
  logger.info('📊 Master Index Summary:');
  logger.info(`Total Levels: ${masterIndex.metadata.totalLevels}`);
  logger.info(`Generated: ${new Date(masterIndex.metadata.generatedAt).toLocaleString()}`);
  logger.info('\nLevels by Source:');
  Object.entries(masterIndex.metadata.sources).forEach(([source, count]) => {
    logger.info(`  - ${source}: ${count as number} levels`);
  });

  // Validate each source
  const validator = new OutputValidator();
  const allResults: ValidationResult[] = [];

  logger.info('\n=== Validating Each Source ===\n');

  for (const source of Object.values(MapSource)) {
    logger.info(`\n📋 Validating ${source} levels...`);
    const { results, summary } = await validator.validateDirectory(outputDir, source);
    allResults.push(...results);

    logger.info(validator.formatSummary(summary));

    if (summary.levelsWithErrors > 0) {
      logger.error(`\n⚠️  Found ${summary.levelsWithErrors} levels with errors in ${source}:`);
      const errored = results.filter(r => r.errors.length > 0).slice(0, 5);
      errored.forEach(r => {
        logger.error(`  - ${r.metadata.title}: ${r.errors[0]}`);
      });
    }
  }

  // Generate comprehensive analysis
  logger.info('\n=== Generating Comprehensive Analysis ===\n');
  const reporter = new AnalysisReporter();
  const report = await reporter.analyzeOutput(outputDir);

  // Display key statistics
  logger.info('📈 Overall Statistics:');
  logger.info(`Total Levels: ${report.levelCount}`);
  logger.info(`Total Size: ${(report.totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  logger.info(`Data Quality Score: ${report.dataQuality.completenessScore}%`);
  logger.info(`Unique Authors: ${report.statistics.byAuthor.size}`);

  // Top authors
  logger.info('\n👥 Top 10 Authors:');
  const sortedAuthors = Array.from(report.statistics.byAuthor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  sortedAuthors.forEach(([author, count], index) => {
    logger.info(`${index + 1}. ${author}: ${count} levels`);
  });

  // Format versions
  logger.info('\n📦 Format Versions:');
  report.statistics.byFormatVersion.forEach((count, version) => {
    logger.info(`  - ${version}: ${count} levels`);
  });

  // File size distribution
  logger.info('\n📊 File Size Distribution:');
  const dist = report.statistics.fileSizeDistribution;
  logger.info(`  Min: ${(dist.min / 1024).toFixed(1)} KB`);
  logger.info(`  Max: ${(dist.max / 1024 / 1024).toFixed(1)} MB`);
  logger.info(`  Average: ${(dist.average / 1024).toFixed(1)} KB`);
  logger.info(`  Median: ${(dist.median / 1024).toFixed(1)} KB`);

  // Data quality issues
  if (
    report.dataQuality.levelsWithoutDescriptions > 0 ||
    report.dataQuality.levelsWithoutTags > 0 ||
    report.dataQuality.levelsWithoutImages > 0
  ) {
    logger.info('\n⚠️  Data Quality Issues:');
    if (report.dataQuality.levelsWithoutDescriptions > 0) {
      logger.warn(
        `  - ${report.dataQuality.levelsWithoutDescriptions} levels without descriptions`
      );
    }
    if (report.dataQuality.levelsWithoutTags > 0) {
      logger.warn(`  - ${report.dataQuality.levelsWithoutTags} levels without tags`);
    }
    if (report.dataQuality.levelsWithoutImages > 0) {
      logger.warn(`  - ${report.dataQuality.levelsWithoutImages} levels without images`);
    }
  }

  // Save reports
  const reportsDir = path.join(outputDir, 'reports');
  await fs.ensureDir(reportsDir);

  await reporter.generateHTMLReport(report, path.join(reportsDir, 'full-catalog-analysis.html'));
  await reporter.generateJSONReport(report, path.join(reportsDir, 'full-catalog-analysis.json'));

  // Validation summary
  const totalErrors = allResults.filter(r => r.errors.length > 0).length;
  const totalWarnings = allResults.filter(r => r.warnings.length > 0).length;

  logger.info('\n=== Validation Summary ===');
  logger.info(`✅ Valid Levels: ${allResults.filter(r => r.valid).length}/${allResults.length}`);
  if (totalErrors > 0) {
    logger.error(`❌ Levels with Errors: ${totalErrors}`);
  }
  if (totalWarnings > 0) {
    logger.warn(`⚠️  Levels with Warnings: ${totalWarnings}`);
  }

  logger.info('\n📄 Reports saved to:');
  logger.info(`  - ${path.join(reportsDir, 'full-catalog-analysis.html')}`);
  logger.info(`  - ${path.join(reportsDir, 'full-catalog-analysis.json')}`);

  // Final status
  if (totalErrors === 0) {
    logger.success('\n✅ Catalog validation completed successfully!');
  } else {
    logger.error('\n❌ Catalog validation completed with errors.');
  }
}

// Run validation
validateFullCatalog().catch(error => {
  logger.error('Validation failed:', error);
  process.exit(1);
});
