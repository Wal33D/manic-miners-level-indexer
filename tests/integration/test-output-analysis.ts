import { MasterIndexer } from '../../src/catalog/masterIndexer';
import { IndexerConfig, MapSource } from '../../src/types';
import { logger } from '../../src/utils/logger';
import { OutputValidator, ValidationResult } from '../../src/tests/outputValidator';
import { AnalysisReporter } from '../../src/tests/analysisReporter';
import fs from 'fs-extra';
import path from 'path';
import { TestPaths } from '../../src/tests/test-config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Comprehensive output analysis test that runs all indexers with limited data
 * and performs deep analysis of the output quality
 */
async function testOutputAnalysis() {
  const outputDir = path.join(TestPaths.integration.all, 'output-analysis');
  const reportsDir = path.join(outputDir, 'reports');

  const config: IndexerConfig = {
    outputDir,
    sources: {
      archive: {
        enabled: true,
        baseUrl: 'https://archive.org/advancedsearch.php',
      },
      discord: {
        enabled: true,
        channels: [
          '683985075704299520', // Old pre-v1 maps
          '1139908458968252457', // Community levels (v1+)
        ],
      },
      hognose: {
        enabled: true,
        githubRepo: 'charredUtensil/hognose',
      },
    },
  };

  // Clean up previous test output
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  await fs.ensureDir(reportsDir);

  logger.info('=== Manic Miners Output Analysis Test ===');
  logger.info(`Output directory: ${outputDir}`);
  logger.info('\nTest Configuration:');
  logger.info('- Archive.org: 20 items');
  logger.info('- Discord: 10 levels per channel (2 channels)');
  logger.info('- Hognose: 20 levels');
  logger.info('- Total expected: ~60 levels\n');

  const masterIndexer = new MasterIndexer(config);

  // Patch indexers to limit data
  await patchIndexersForQuickTest(masterIndexer);

  const startTime = Date.now();

  try {
    // === Phase 1: Index with limited data ===
    logger.info('📥 Phase 1: Indexing with limited data...\n');
    await masterIndexer.indexAll();

    const duration = Date.now() - startTime;
    logger.info(`\n✅ Indexing completed in ${Math.round(duration / 1000)}s`);

    // Get catalog stats
    const stats = await masterIndexer.getCatalogStats();
    logger.info(`\n📊 Catalog Statistics:`);
    logger.info(`Total levels: ${stats.totalLevels}`);
    Object.entries(stats.sources).forEach(([source, count]) => {
      logger.info(`  - ${source}: ${count} levels`);
    });

    // === Phase 2: Validate all output ===
    logger.info('\n\n🔍 Phase 2: Validating output...\n');
    const validator = new OutputValidator();
    const validationResults: ValidationResult[] = [];

    for (const source of Object.values(MapSource)) {
      logger.info(`Validating ${source} levels...`);
      const { results, summary } = await validator.validateDirectory(outputDir, source);
      validationResults.push(...results);

      if (results.length > 0) {
        logger.info(validator.formatSummary(summary));

        // Show sample validation details
        const sampleResult = results[0];
        if (sampleResult) {
          logger.info(`\nSample validation for "${sampleResult.metadata.title}":`);
          if (sampleResult.errors.length > 0) {
            logger.error(`  Errors: ${sampleResult.errors.slice(0, 3).join(', ')}`);
          }
          if (sampleResult.warnings.length > 0) {
            logger.warn(`  Warnings: ${sampleResult.warnings.slice(0, 3).join(', ')}`);
          }
        }
      }
    }

    // === Phase 3: Generate comprehensive analysis ===
    logger.info('\n\n📈 Phase 3: Analyzing output quality...\n');
    const reporter = new AnalysisReporter();
    const report = await reporter.analyzeOutput(outputDir, validationResults);

    // Display key metrics
    logger.info('🎯 Key Metrics:');
    logger.info(`  Data Quality Score: ${report.dataQuality.completenessScore}%`);
    logger.info(`  Total Size: ${(report.totalSize / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`  Unique Authors: ${report.statistics.byAuthor.size}`);
    logger.info(
      `  Format Versions: ${Array.from(report.statistics.byFormatVersion.keys()).join(', ')}`
    );

    // Show data quality issues
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

    // Show recommendations
    if (report.recommendations.length > 0) {
      logger.info('\n💡 Recommendations:');
      report.recommendations.forEach(rec => logger.info(`  ${rec}`));
    }

    // === Phase 4: Deep dive into each source ===
    logger.info('\n\n🔬 Phase 4: Source-specific analysis...\n');

    for (const [source, sourceStats] of report.statistics.bySource) {
      if (sourceStats.levelCount > 0) {
        logger.info(`\n${source}:`);
        logger.info(`  Levels: ${sourceStats.levelCount}`);
        logger.info(`  Average size: ${(sourceStats.averageSize / 1024).toFixed(1)} KB`);
        logger.info(`  Unique authors: ${sourceStats.uniqueAuthors}`);
        logger.info(
          `  Date range: ${sourceStats.oldestLevel?.toLocaleDateString()} - ${sourceStats.newestLevel?.toLocaleDateString()}`
        );
        if (sourceStats.topTags.length > 0) {
          logger.info(`  Top tags: ${sourceStats.topTags.join(', ')}`);
        }
      }
    }

    // File size distribution
    logger.info('\n📊 File Size Distribution:');
    for (const [bucket, count] of report.statistics.fileSizeDistribution.buckets) {
      const percentage = ((count / report.levelCount) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(parseInt(percentage) / 2));
      logger.info(`  ${bucket.padEnd(12)} ${bar} ${count} (${percentage}%)`);
    }

    // === Phase 5: Generate reports ===
    logger.info('\n\n📄 Phase 5: Generating reports...\n');

    await reporter.generateHTMLReport(report, path.join(reportsDir, 'analysis.html'));
    await reporter.generateJSONReport(report, path.join(reportsDir, 'analysis.json'));

    // Save validation details
    await fs.writeJSON(path.join(reportsDir, 'validation-results.json'), validationResults, {
      spaces: 2,
    });

    // Generate source comparison
    const comparison = generateSourceComparison(report);
    await fs.writeFile(path.join(reportsDir, 'source-comparison.txt'), comparison);

    logger.info(`✅ Reports generated:`);
    logger.info(`  - ${path.join(reportsDir, 'analysis.html')}`);
    logger.info(`  - ${path.join(reportsDir, 'analysis.json')}`);
    logger.info(`  - ${path.join(reportsDir, 'validation-results.json')}`);
    logger.info(`  - ${path.join(reportsDir, 'source-comparison.txt')}`);

    // === Final Summary ===
    logger.info('\n\n🏁 Test Summary:');
    logger.info(
      `  ✅ Successfully indexed ${report.levelCount} levels from ${report.sources.length} sources`
    );
    logger.info(`  ✅ Data quality score: ${report.dataQuality.completenessScore}%`);
    logger.info(
      `  ✅ Validation complete with ${validationResults.filter(r => r.valid).length}/${validationResults.length} valid levels`
    );
    logger.info(`  ✅ Analysis reports generated`);

    // Exit with appropriate code
    const hasErrors = validationResults.some(r => r.errors.length > 0);
    process.exit(hasErrors ? 1 : 0);
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
}

/**
 * Patch indexers to limit the amount of data processed for quick testing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchIndexersForQuickTest(masterIndexer: any) {
  const MAX_ARCHIVE_ITEMS = 20;
  const MAX_DISCORD_PER_CHANNEL = 10;
  const MAX_HOGNOSE_ITEMS = 20;

  // Patch Archive indexer
  if (masterIndexer.internetArchiveIndexer) {
    let archiveCount = 0;
    const archiveIndexer = masterIndexer.internetArchiveIndexer;
    const originalProcess = archiveIndexer.processCompleteItem;
    archiveIndexer.processCompleteItem = async function (metadata: unknown) {
      if (archiveCount >= MAX_ARCHIVE_ITEMS) return false;
      const result = await originalProcess.apply(this, [metadata]);
      if (result) archiveCount++;
      return result;
    };
  }

  // Patch Discord indexer
  if (masterIndexer.discordIndexer) {
    let discordCount = 0;
    const discordIndexer = masterIndexer.discordIndexer;
    const originalProcess = discordIndexer.processDiscordMessage;
    discordIndexer.processDiscordMessage = async function (...args: unknown[]) {
      if (discordCount >= MAX_DISCORD_PER_CHANNEL * 2) return []; // 2 channels
      const result = await originalProcess.apply(this, args);
      if (result.length > 0) discordCount++;
      return result;
    };
  }

  // Patch Hognose indexer
  if (masterIndexer.hognoseIndexer) {
    let hognoseCount = 0;
    const hognoseIndexer = masterIndexer.hognoseIndexer;
    const originalProcess = hognoseIndexer.processLevel;
    hognoseIndexer.processLevel = async function (...args: unknown[]) {
      if (hognoseCount >= MAX_HOGNOSE_ITEMS) return;
      const result = await originalProcess.apply(this, args);
      if (result) hognoseCount++;
      return result;
    };
  }
}

/**
 * Generate a text comparison of the three sources
 */
interface AnalysisReport {
  levelCount: number;
  dataQuality?: {
    completenessScore: number;
  };
  statistics: {
    bySource: Map<
      MapSource,
      {
        levelCount: number;
        uniqueAuthors: number;
        averageSize: number;
        oldestLevel?: Date | null;
        newestLevel?: Date | null;
      }
    >;
  };
}

function generateSourceComparison(report: AnalysisReport) {
  const lines = [
    '=== SOURCE COMPARISON ===',
    '',
    'Metric                  Archive.org    Discord        Hognose',
    '─'.repeat(60),
  ];

  const sources = [MapSource.ARCHIVE, MapSource.DISCORD, MapSource.HOGNOSE];
  const getMetric = (source: MapSource, metric: string) => {
    const stats = report.statistics.bySource.get(source);
    if (!stats) return 'N/A';

    switch (metric) {
      case 'levels':
        return stats.levelCount.toString();
      case 'avgSize':
        return `${(stats.averageSize / 1024).toFixed(1)}KB`;
      case 'authors':
        return stats.uniqueAuthors.toString();
      case 'dateRange': {
        if (!stats.oldestLevel || !stats.newestLevel) return 'N/A';
        const days = Math.round(
          (stats.newestLevel.getTime() - stats.oldestLevel.getTime()) / (1000 * 60 * 60 * 24)
        );
        return `${days} days`;
      }
      default:
        return 'N/A';
    }
  };

  const metrics = [
    { name: 'Total Levels', key: 'levels' },
    { name: 'Average Size', key: 'avgSize' },
    { name: 'Unique Authors', key: 'authors' },
    { name: 'Date Range', key: 'dateRange' },
  ];

  for (const metric of metrics) {
    const row = [
      metric.name.padEnd(20),
      getMetric(sources[0], metric.key).padEnd(13),
      getMetric(sources[1], metric.key).padEnd(13),
      getMetric(sources[2], metric.key),
    ];
    lines.push(row.join('  '));
  }

  lines.push('');
  lines.push('Data Quality Score:');
  lines.push(`Overall: ${report.dataQuality?.completenessScore ?? 'N/A'}%`);

  return lines.join('\n');
}

// Run the test
testOutputAnalysis().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
