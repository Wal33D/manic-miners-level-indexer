import { DuplicateAnalyzer } from '../src/utils/duplicateAnalyzer';
import { logger } from '../src/utils/logger';
import { FileUtils } from '../src/utils/fileUtils';
import { MapSource, DuplicateAnalysisReport, DuplicateGroup } from '../src/types';
import { MergePreview } from '../src/utils/mergePreview';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

interface AnalyzeOptions {
  outputDir: string;
  reportFormat: 'console' | 'json' | 'html' | 'all';
  sources?: MapSource[];
  showDetails: boolean;
}

async function analyzeDuplicates(options: AnalyzeOptions) {
  const startTime = Date.now();

  logger.info(chalk.blue('=== Manic Miners Duplicate Analysis ===\n'));

  // Check if output directory exists
  if (!(await fs.pathExists(options.outputDir))) {
    logger.error(`Output directory not found: ${options.outputDir}`);
    process.exit(1);
  }

  // Initialize analyzer
  const analyzer = new DuplicateAnalyzer(options.outputDir);

  try {
    // Run analysis
    const report = await analyzer.analyzeCatalog();

    // Display console summary
    displayConsoleSummary(report);

    // Show detailed duplicate groups if requested
    if (options.showDetails && report.duplicateGroups.length > 0) {
      displayDetailedDuplicates(report, options);
    }

    // Generate reports based on format
    await generateReports(report, options);

    const duration = Date.now() - startTime;
    logger.success(`\n✅ Analysis completed in ${(duration / 1000).toFixed(2)}s`);
  } catch (error) {
    logger.error('Analysis failed:', error);
    process.exit(1);
  }
}

function displayConsoleSummary(report: DuplicateAnalysisReport) {
  logger.info(chalk.yellow('\n📊 Summary Statistics:'));
  logger.info(`  Total Levels: ${report.totalLevels}`);
  logger.info(`  Unique Levels: ${report.uniqueLevels}`);
  logger.info(`  Duplicate Levels: ${report.duplicateCount}`);
  logger.info(
    `  Duplicate Percentage: ${((report.duplicateCount / report.totalLevels) * 100).toFixed(1)}%`
  );

  logger.info(chalk.yellow('\n📈 Duplicate Distribution:'));
  logger.info(`  Cross-Source Duplicates: ${report.statistics.crossSourceDuplicates} groups`);
  logger.info(`  Within-Source Duplicates: ${report.statistics.withinSourceDuplicates} groups`);
  logger.info(`  Largest Duplicate Group: ${report.statistics.largestDuplicateGroup} copies`);

  logger.info(chalk.yellow('\n📂 By Source:'));
  logger.info(chalk.gray('  (Pre-merge analysis - original sources only)'));
  for (const [source, stats] of Object.entries(report.statistics.bySource)) {
    const percentage =
      stats.total > 0 ? ((stats.duplicates / stats.total) * 100).toFixed(1) : '0.0';
    logger.info(
      `  ${source}: ${stats.total} total, ${stats.unique} unique, ${stats.duplicates} duplicates (${percentage}%)`
    );
  }
}

function displayDetailedDuplicates(report: DuplicateAnalysisReport, options: AnalyzeOptions) {
  logger.info(chalk.yellow('\n🔍 Detailed Duplicate Groups (Will Be Merged):'));

  // Show merge benefits first
  logger.info(MergePreview.getMergeBenefitsSummary());

  // Show top 10 duplicate groups
  const groupsToShow = Math.min(10, report.duplicateGroups.length);
  logger.info(
    chalk.yellow(`\nShowing top ${groupsToShow} of ${report.duplicateGroups.length} groups:\n`)
  );

  for (let i = 0; i < groupsToShow; i++) {
    const group = report.duplicateGroups[i];
    logger.info(MergePreview.formatDuplicateGroupForMerge(group));

    // Show merge preview
    if (options.showDetails) {
      logger.info(MergePreview.generatePreview(group));
    }
  }

  if (report.duplicateGroups.length > groupsToShow) {
    logger.info(
      chalk.gray(`\n... and ${report.duplicateGroups.length - groupsToShow} more duplicate groups`)
    );
  }
}

async function generateReports(report: DuplicateAnalysisReport, options: AnalyzeOptions) {
  const reportsDir = path.join(options.outputDir, 'duplicate-reports');
  logger.info(`\n📁 Creating reports directory: ${reportsDir}`);
  logger.info(`Report format requested: ${options.reportFormat}`);
  await fs.ensureDir(reportsDir);

  // JSON report
  if (options.reportFormat === 'json' || options.reportFormat === 'all') {
    const jsonPath = path.join(reportsDir, 'duplicates.json');
    logger.info(`Writing JSON report to: ${jsonPath}`);
    try {
      await FileUtils.writeJSON(jsonPath, report);
      logger.info(`📄 JSON report saved to: ${jsonPath}`);
    } catch (error) {
      logger.error(`Failed to write JSON report:`, error);
    }
  }

  // HTML report
  if (options.reportFormat === 'html' || options.reportFormat === 'all') {
    const htmlPath = path.join(reportsDir, 'duplicates.html');
    logger.info(`Writing HTML report to: ${htmlPath}`);
    try {
      await generateHTMLReport(report, htmlPath);
      logger.info(`📄 HTML report saved to: ${htmlPath}`);
    } catch (error) {
      logger.error(`Failed to write HTML report:`, error);
    }
  }
}

async function generateHTMLReport(report: DuplicateAnalysisReport, outputPath: string) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manic Miners Duplicate Analysis & Merge Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .summary {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .stat-card {
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #3498db;
    }
    .stat-label {
      color: #7f8c8d;
      font-size: 0.9em;
    }
    .duplicate-group {
      background-color: white;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .level-entry {
      padding: 8px;
      margin: 5px 0;
      background-color: #f8f9fa;
      border-radius: 4px;
      border-left: 3px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .level-entry:hover {
      background-color: #f0f0f0;
      border-left-color: #999;
    }
    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
      color: white;
    }
    .source-archive { background-color: #e74c3c; }
    .source-discord { background-color: #3498db; }
    .source-hognose { background-color: #2ecc71; }
    .source-merged { background-color: #9c27b0; }
  </style>
</head>
<body>
  <h1>🔍 Manic Miners Duplicate Analysis Report</h1>
  <p>Generated on ${new Date(report.generatedAt).toLocaleString()}</p>
  <p style="color: #666;">This is a pre-merge analysis showing duplicates across original sources (Archive, Discord, Hognose)</p>

  <div class="summary">
    <h2>Summary Statistics</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${report.totalLevels}</div>
        <div class="stat-label">Total Levels</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.uniqueLevels}</div>
        <div class="stat-label">Unique Levels</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.duplicateCount}</div>
        <div class="stat-label">Duplicate Levels</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${((report.duplicateCount / report.totalLevels) * 100).toFixed(
          1
        )}%</div>
        <div class="stat-label">Duplicate Rate</div>
      </div>
    </div>
  </div>

  <div class="summary">
    <h2>Source Statistics</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #ddd;">
          <th style="text-align: left; padding: 8px;">Source</th>
          <th style="text-align: center; padding: 8px;">Total</th>
          <th style="text-align: center; padding: 8px;">Unique</th>
          <th style="text-align: center; padding: 8px;">Duplicates</th>
          <th style="text-align: center; padding: 8px;">Duplicate %</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(report.statistics.bySource)
          .map(
            ([source, stats]) => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;"><span class="source-badge source-${source}">${source.toUpperCase()}</span></td>
            <td style="text-align: center; padding: 8px;">${stats.total}</td>
            <td style="text-align: center; padding: 8px;">${stats.unique}</td>
            <td style="text-align: center; padding: 8px;">${stats.duplicates}</td>
            <td style="text-align: center; padding: 8px;">${
              stats.total > 0 ? ((stats.duplicates / stats.total) * 100).toFixed(1) : '0.0'
            }%</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="summary">
    <h2>Duplicate Groups to Merge (${report.duplicateGroups.length} total)</h2>
    <p>Cross-source duplicates: ${report.statistics.crossSourceDuplicates} groups<br>
       Within-source duplicates: ${report.statistics.withinSourceDuplicates} groups</p>
    <div style="background-color: #e3f2fd; padding: 15px; border-radius: 6px; margin-top: 20px;">
      <h3>🔀 Merge Process</h3>
      <p>These duplicate groups will be intelligently merged to create a unified catalog with:</p>
      <ul>
        <li>Professional descriptions from Archive.org</li>
        <li>Accurate timestamps from Discord</li>
        <li>Author's original notes preserved</li>
        <li>All unique metadata combined</li>
      </ul>
    </div>
  </div>

  ${report.duplicateGroups
    .slice(0, 50)
    .map((group, index) => {
      const archiveLevel = group.levels.find(l => l.source === 'archive');
      const discordLevel = group.levels.find(l => l.source === 'discord');
      return `
      <div class="duplicate-group">
        <h3>Group ${index + 1} - ${group.levels.length} sources will be merged (${(
          group.fileSize / 1024
        ).toFixed(1)} KB)</h3>
        <div style="font-family: monospace; font-size: 0.8em; color: #666; margin-bottom: 10px;">
          Hash: ${group.hash.substring(0, 16)}...
        </div>
        <div style="background-color: #f0f8ff; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
          <strong>🔀 These ${group.levels.length} sources will be merged</strong>
          <br><small>A new unified entry will be created combining the best metadata from each source:</small>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
            ${archiveLevel ? '<li>Professional description from Archive.org</li>' : ''}
            ${discordLevel ? '<li>Accurate timestamps from Discord</li>' : ''}
            ${group.levels.some(l => l.metadata.tags && l.metadata.tags.length > 0) ? '<li>Combined tags from all sources</li>' : ''}
          </ul>
        </div>
        ${group.levels
          .map(
            level => `
          <div class="level-entry">
            <div>
              <span class="source-badge source-${level.source}">${level.source.toUpperCase()}</span>
              <strong>${level.title}</strong> by ${level.author}
              ${level.uploadDate ? `(${new Date(level.uploadDate).toLocaleDateString()})` : ''}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
    })
    .join('')}

  ${
    report.duplicateGroups.length > 50
      ? `<p style="text-align: center; color: #666; margin: 20px;">
          Showing first 50 of ${report.duplicateGroups.length} duplicate groups
        </p>`
      : ''
  }
</body>
</html>
  `;

  await fs.writeFile(outputPath, html);
}

// Parse command line arguments
function parseArgs(): AnalyzeOptions {
  const args = process.argv.slice(2);
  const options: AnalyzeOptions = {
    outputDir: './output',
    reportFormat: 'console',
    showDetails: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      options.outputDir = args[++i];
    } else if (arg === '--format' || arg === '-f') {
      const format = args[++i];
      if (['console', 'json', 'html', 'all'].includes(format)) {
        options.reportFormat = format as 'console' | 'json' | 'html' | 'all';
      }
    } else if (arg === '--sources' || arg === '-s') {
      const sources = args[++i].split(',') as MapSource[];
      options.sources = sources;
    } else if (arg === '--details' || arg === '-d') {
      options.showDetails = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Manic Miners Duplicate Analysis Tool

Usage: npm run analyze:duplicates [options]

Options:
  --output, -o <dir>     Output directory (default: ./output)
  --format, -f <format>  Report format: console, json, html, all (default: console)
  --sources, -s <list>   Comma-separated list of sources to analyze
  --details, -d          Show detailed duplicate groups in console
  --help, -h             Show this help message

Examples:
  npm run analyze:duplicates
  npm run analyze:duplicates -- --format=html --details
  npm run analyze:duplicates -- --sources=discord,archive --format=all
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run the analysis
const options = parseArgs();
analyzeDuplicates(options).catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
