import { LevelMerger } from '../src/core/levelMerger';
import { logger } from '../src/utils/logger';
import { FileUtils } from '../src/utils/fileUtils';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

interface MergeOptions {
  outputDir: string;
  verbose: boolean;
  dryRun: boolean;
}

async function mergeDuplicateLevels(options: MergeOptions) {
  const startTime = Date.now();

  logger.info(chalk.blue.bold('🔀 Manic Miners Level Merge System\n'));

  // Validate output directory
  if (!(await fs.pathExists(options.outputDir))) {
    logger.error(`Output directory not found: ${options.outputDir}`);
    process.exit(1);
  }

  // Check for required files
  const catalogPath = path.join(options.outputDir, 'catalog_index.json');
  if (!(await fs.pathExists(catalogPath))) {
    logger.error('Catalog index not found. Please run the indexing process first.');
    process.exit(1);
  }

  if (options.dryRun) {
    logger.info(chalk.yellow('🔍 DRY RUN MODE - No files will be created\n'));
  }

  try {
    const merger = new LevelMerger(options.outputDir);

    if (options.dryRun) {
      // Just analyze and report what would be done
      const { DuplicateAnalyzer } = await import('../src/utils/duplicateAnalyzer');
      const analyzer = new DuplicateAnalyzer(options.outputDir);
      const report = await analyzer.analyzeCatalog();

      logger.info(chalk.yellow('\n📊 Merge Preview:'));
      logger.info(`  Duplicate groups to merge: ${report.duplicateGroups.length}`);
      logger.info(`  Unique levels to copy: ${report.uniqueLevels}`);
      logger.info(
        `  Total levels after merge: ${report.uniqueLevels + report.duplicateGroups.length}`
      );

      if (options.verbose && report.duplicateGroups.length > 0) {
        logger.info(chalk.yellow('\n📋 Sample merges (first 5):'));

        for (let i = 0; i < Math.min(5, report.duplicateGroups.length); i++) {
          const group = report.duplicateGroups[i];
          logger.info(`\n  ${i + 1}. "${group.levels[0].title}"`);
          group.levels.forEach(level => {
            logger.info(`     - [${level.source}] ${level.author}`);
          });
        }
      }
    } else {
      // Actually perform the merge
      const result = await merger.mergeDuplicateLevels();

      // Display results
      logger.info(chalk.green.bold('\n✅ Merge Complete!\n'));

      logger.info(chalk.yellow('📊 Results:'));
      logger.info(`  Duplicate groups merged: ${result.totalMergedLevels}`);
      logger.info(`  Unique levels copied: ${result.totalUniqueLevels}`);
      logger.info(`  Total levels in merged catalog: ${result.mergedCatalog.totalLevels}`);

      // Show space saved
      const originalCount = result.totalMergedLevels * 2 + result.totalUniqueLevels; // Assuming avg 2 copies per duplicate
      const spaceSaved = (
        ((originalCount - result.mergedCatalog.totalLevels) / originalCount) *
        100
      ).toFixed(1);
      logger.info(`  Space saved: ~${spaceSaved}% (removed duplicate files)`);

      logger.info(chalk.yellow('\n📁 Output:'));
      logger.info(`  Merged levels directory: ${path.join(options.outputDir, 'levels-merged')}`);
      logger.info(
        `  Merged catalog: ${path.join(options.outputDir, 'levels-merged', 'catalog_index.json')}`
      );
    }

    const duration = Date.now() - startTime;
    logger.info(chalk.gray(`\n⏱️  Process completed in ${(duration / 1000).toFixed(2)}s`));
  } catch (error) {
    logger.error('Merge process failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): MergeOptions {
  const args = process.argv.slice(2);
  const options: MergeOptions = {
    outputDir: './output',
    verbose: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      options.outputDir = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Manic Miners Level Merge Tool

This tool merges duplicate levels from different sources (Archive.org, Discord)
into single entries with combined metadata.

Usage: npm run merge:levels [options]

Options:
  --output, -o <dir>    Output directory containing indexed levels (default: ./output)
  --verbose, -v         Show detailed merge information
  --dry-run, -n         Preview what would be merged without creating files
  --help, -h            Show this help message

Examples:
  npm run merge:levels
  npm run merge:levels -- --dry-run --verbose
  npm run merge:levels -- --output ./data

The merge process will:
1. Identify all duplicate levels across sources
2. Combine the best metadata from each source:
   - Archive.org's professional descriptions
   - Discord's accurate timestamps and author notes
3. Create a unified catalog with no duplicates
4. Preserve references to all original sources
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run the merge
const options = parseArgs();
mergeDuplicateLevels(options).catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
