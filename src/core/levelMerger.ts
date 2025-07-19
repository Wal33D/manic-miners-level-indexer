import { CatalogIndex, Level, MapSource, DuplicateAnalysisReport, DuplicateGroup } from '../types';
import { MetadataMerger, MergedMetadata } from '../utils/metadataMerger';
import { DuplicateAnalyzer } from '../utils/duplicateAnalyzer';
import { FileUtils } from '../utils/fileUtils';
import { logger } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';

export interface MergeResult {
  totalDuplicateGroups: number;
  totalMergedLevels: number;
  totalUniqueLevels: number;
  mergedCatalog: CatalogIndex;
  originalStats: {
    totalLevels: number;
    bySource: Record<MapSource, number>;
  };
  spaceSaved: number;
}

export class LevelMerger {
  private outputDir: string;
  private mergedDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.mergedDir = path.join(outputDir, 'levels-merged');
  }

  /**
   * Merge all duplicate levels into single best-of versions
   */
  async mergeDuplicateLevels(): Promise<MergeResult> {
    logger.info('🔀 Starting level merge process...');

    // Load the catalog
    const catalogPath = path.join(this.outputDir, 'catalog_index.json');
    const catalog = await FileUtils.readJSON<CatalogIndex>(catalogPath);
    if (!catalog) {
      throw new Error('Failed to load catalog index');
    }

    // Run duplicate analysis
    logger.info('Analyzing duplicates...');
    const analyzer = new DuplicateAnalyzer(this.outputDir);
    const duplicateReport = await analyzer.analyzeCatalog(catalog);

    // Prepare merged directory
    await fs.ensureDir(this.mergedDir);

    // Track unique and merged levels
    const mergedLevels: Level[] = [];
    const processedHashes = new Set<string>();

    // Process duplicate groups
    logger.info(`Processing ${duplicateReport.duplicateGroups.length} duplicate groups...`);

    for (const group of duplicateReport.duplicateGroups) {
      try {
        const mergedLevel = await this.processDuplicateGroup(group);
        if (mergedLevel) {
          mergedLevels.push(mergedLevel);
          processedHashes.add(group.hash);
        }
      } catch (error) {
        logger.error(`Failed to merge group with hash ${group.hash}:`, error);
      }
    }

    // Add non-duplicate levels
    logger.info('Adding unique levels...');
    let uniqueCount = 0;

    for (const level of catalog.levels) {
      // Check if this level was part of a duplicate group
      const datFile = level.files.find(f => f.type === 'dat');
      const hash = datFile?.hash;

      if (hash && !processedHashes.has(hash)) {
        // This is a unique level, copy it to merged
        const copiedLevel = await this.copyUniqueLevel(level);
        if (copiedLevel) {
          mergedLevels.push(copiedLevel);
          uniqueCount++;
        }
      }
    }

    // Create merged catalog
    const mergedCatalog: CatalogIndex = {
      totalLevels: mergedLevels.length,
      sources: {
        [MapSource.ARCHIVE]: 0,
        [MapSource.DISCORD]: 0,
        [MapSource.HOGNOSE]: 0,
        [MapSource.MERGED]: mergedLevels.filter(l => l.metadata.source === MapSource.MERGED).length,
      },
      lastUpdated: new Date(),
      levels: mergedLevels,
    };

    // Count sources properly
    mergedCatalog.sources[MapSource.ARCHIVE] = mergedLevels.filter(
      l => l.metadata.source === MapSource.ARCHIVE
    ).length;
    mergedCatalog.sources[MapSource.DISCORD] = mergedLevels.filter(
      l => l.metadata.source === MapSource.DISCORD
    ).length;
    mergedCatalog.sources[MapSource.HOGNOSE] = mergedLevels.filter(
      l => l.metadata.source === MapSource.HOGNOSE
    ).length;

    // Save merged catalog
    const mergedCatalogPath = path.join(this.mergedDir, 'catalog_index.json');
    await FileUtils.writeJSON(mergedCatalogPath, mergedCatalog);

    // Calculate space saved
    let totalSpaceSaved = 0;
    for (const group of duplicateReport.duplicateGroups) {
      // Space saved is (number of duplicates - 1) * file size
      totalSpaceSaved += (group.levels.length - 1) * group.fileSize;
    }

    logger.success(`✅ Merge complete! Created ${mergedLevels.length} levels in merged catalog`);

    const result: MergeResult = {
      totalDuplicateGroups: duplicateReport.duplicateGroups.length,
      totalMergedLevels: duplicateReport.duplicateGroups.length,
      totalUniqueLevels: uniqueCount,
      mergedCatalog,
      originalStats: {
        totalLevels: catalog.levels.length,
        bySource: {
          [MapSource.ARCHIVE]: catalog.sources[MapSource.ARCHIVE],
          [MapSource.DISCORD]: catalog.sources[MapSource.DISCORD],
          [MapSource.HOGNOSE]: catalog.sources[MapSource.HOGNOSE],
          [MapSource.MERGED]: 0,
        },
      },
      spaceSaved: totalSpaceSaved,
    };

    // Generate merge summary reports
    await this.generateMergeSummaryReports(result, duplicateReport);

    return result;
  }

  /**
   * Process a single duplicate group into a merged level
   */
  private async processDuplicateGroup(group: DuplicateGroup): Promise<Level | null> {
    try {
      // Merge metadata
      const mergedMetadata = MetadataMerger.mergeDuplicateGroup(group);

      // Use the first level's files as base (they're identical)
      const sourceLevel = group.levels[0];
      const levelId = mergedMetadata.id;
      const levelDir = path.join(this.mergedDir, levelId);

      // Create level directory
      await fs.ensureDir(levelDir);

      // Copy DAT file (same across all duplicates)
      const datFile =
        sourceLevel.metadata.source === MapSource.ARCHIVE
          ? path.join(
              this.outputDir,
              'levels-archive',
              sourceLevel.id,
              path.basename(sourceLevel.path)
            )
          : sourceLevel.metadata.source === MapSource.DISCORD
            ? path.join(
                this.outputDir,
                'levels-discord',
                sourceLevel.id,
                path.basename(sourceLevel.path)
              )
            : sourceLevel.path;

      const destDatPath = path.join(levelDir, path.basename(sourceLevel.path));
      await fs.copy(datFile, destDatPath);

      // Create merged level object
      const mergedLevel: Level = {
        metadata: {
          ...mergedMetadata,
          source: MapSource.MERGED,
        },
        files: [
          {
            filename: path.basename(destDatPath),
            path: destDatPath,
            size: group.fileSize,
            hash: group.hash,
            type: 'dat',
          },
        ],
        catalogPath: path.join(levelDir, 'catalog.json'),
        datFilePath: destDatPath,
        indexed: new Date(),
        lastUpdated: new Date(),
      };

      // Save individual catalog
      await FileUtils.writeJSON(mergedLevel.catalogPath, mergedLevel);

      // Create a README with merge information
      const readmePath = path.join(levelDir, 'MERGE_INFO.md');
      await this.createMergeReadme(readmePath, mergedMetadata, group);

      return mergedLevel;
    } catch (error) {
      logger.error(`Failed to process duplicate group:`, error);
      return null;
    }
  }

  /**
   * Copy a unique level to the merged directory
   */
  private async copyUniqueLevel(level: Level): Promise<Level | null> {
    try {
      const levelId = level.metadata.id;
      const levelDir = path.join(this.mergedDir, levelId);

      // Create level directory
      await fs.ensureDir(levelDir);

      // Determine source directory
      const sourceDir =
        level.metadata.source === MapSource.ARCHIVE
          ? path.join(this.outputDir, 'levels-archive', levelId)
          : level.metadata.source === MapSource.DISCORD
            ? path.join(this.outputDir, 'levels-discord', levelId)
            : path.join(this.outputDir, 'levels-hognose', levelId);

      // Copy all files
      await fs.copy(sourceDir, levelDir);

      // Create new level object with updated paths
      const newLevel: Level = {
        ...level,
        catalogPath: path.join(levelDir, 'catalog.json'),
        datFilePath: path.join(levelDir, path.basename(level.datFilePath)),
        files: level.files.map(file => ({
          ...file,
          path: path.join(levelDir, file.filename),
        })),
      };

      // Update catalog file
      await FileUtils.writeJSON(newLevel.catalogPath, newLevel);

      return newLevel;
    } catch (error) {
      logger.error(`Failed to copy unique level ${level.metadata.id}:`, error);
      return null;
    }
  }

  /**
   * Create a README file explaining the merge
   */
  private async createMergeReadme(
    readmePath: string,
    metadata: MergedMetadata,
    group: DuplicateGroup
  ): Promise<void> {
    const content = `# ${metadata.title}
By: ${metadata.author}

## About This Merged Level

This level has been automatically merged from multiple sources to provide the best possible metadata and preserve all community contributions.

### Description
${metadata.description}

${metadata.authorNotes ? `### Author's Notes\n${metadata.authorNotes}\n` : ''}

### Sources
This level was merged from the following sources:

${group.levels
  .map(
    (level: (typeof group.levels)[0]) =>
      `- **${level.source.toUpperCase()}**: ${level.title}
  - Uploaded: ${level.uploadDate ? new Date(level.uploadDate).toLocaleDateString() : 'Unknown'}
  - URL: ${level.metadata.sourceUrl || 'N/A'}`
  )
  .join('\n\n')}

### Technical Details
- File Hash: ${group.hash}
- File Size: ${(group.fileSize / 1024).toFixed(1)} KB
- Format Version: ${metadata.formatVersion || 'Unknown'}

### Why Merged?
This unified version combines:
- Archive.org's curated descriptions and metadata
- Discord's accurate upload dates and author communications
- All unique tags and metadata from both sources

---
*This file was automatically generated by the Manic Miners Level Indexer*
`;

    await fs.writeFile(readmePath, content);
  }

  /**
   * Generate merge summary reports
   */
  private async generateMergeSummaryReports(
    result: MergeResult,
    duplicateReport: DuplicateAnalysisReport
  ): Promise<void> {
    const reportsDir = path.join(this.mergedDir, 'reports');
    await fs.ensureDir(reportsDir);

    // Generate JSON report
    const jsonReport = {
      generatedAt: new Date(),
      summary: {
        originalLevels: result.originalStats.totalLevels,
        mergedLevels: result.mergedCatalog.totalLevels,
        duplicatesRemoved: result.originalStats.totalLevels - result.mergedCatalog.totalLevels,
        spaceSavedMB: (result.spaceSaved / (1024 * 1024)).toFixed(2),
        reductionPercentage: (
          ((result.originalStats.totalLevels - result.mergedCatalog.totalLevels) /
            result.originalStats.totalLevels) *
          100
        ).toFixed(1),
      },
      beforeMerge: {
        total: result.originalStats.totalLevels,
        bySource: result.originalStats.bySource,
        duplicateGroups: result.totalDuplicateGroups,
        duplicateLevels: duplicateReport.duplicateCount,
      },
      afterMerge: {
        total: result.mergedCatalog.totalLevels,
        bySource: result.mergedCatalog.sources,
        uniqueLevels: result.totalUniqueLevels,
        mergedLevels: result.totalMergedLevels,
      },
    };

    const jsonPath = path.join(reportsDir, 'merge-summary.json');
    await FileUtils.writeJSON(jsonPath, jsonReport);
    logger.info(`📄 Merge summary JSON saved to: ${jsonPath}`);

    // Generate HTML report
    const htmlPath = path.join(reportsDir, 'merge-summary.html');
    await this.generateMergeSummaryHTML(jsonReport, htmlPath);
    logger.info(`📄 Merge summary HTML saved to: ${htmlPath}`);
  }

  /**
   * Generate HTML merge summary report
   */
  private async generateMergeSummaryHTML(
    report: {
      generatedAt: Date;
      summary: {
        originalLevels: number;
        mergedLevels: number;
        duplicatesRemoved: number;
        spaceSavedMB: string;
        reductionPercentage: string;
      };
      beforeMerge: {
        total: number;
        bySource: Record<MapSource, number>;
        duplicateGroups: number;
        duplicateLevels: number;
      };
      afterMerge: {
        total: number;
        bySource: Record<MapSource, number>;
        uniqueLevels: number;
        mergedLevels: number;
      };
    },
    outputPath: string
  ): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manic Miners Merge Summary Report</title>
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
    .comparison-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .comparison-table th,
    .comparison-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    .comparison-table th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    .highlight-success {
      color: #27ae60;
      font-weight: bold;
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
  <h1>🔀 Manic Miners Merge Summary Report</h1>
  <p>Generated on ${new Date(report.generatedAt).toLocaleString()}</p>

  <div class="summary">
    <h2>📊 Merge Results Overview</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${report.summary.originalLevels}</div>
        <div class="stat-label">Original Levels</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.mergedLevels}</div>
        <div class="stat-label">After Merge</div>
      </div>
      <div class="stat-card">
        <div class="stat-value highlight-success">${report.summary.duplicatesRemoved}</div>
        <div class="stat-label">Duplicates Removed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value highlight-success">${report.summary.spaceSavedMB} MB</div>
        <div class="stat-label">Space Saved</div>
      </div>
    </div>
    <p style="text-align: center; font-size: 1.2em; margin-top: 20px;">
      <strong>Total Reduction: <span class="highlight-success">${report.summary.reductionPercentage}%</span></strong>
    </p>
  </div>

  <div class="summary">
    <h2>📈 Before & After Comparison</h2>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Before Merge</th>
          <th>After Merge</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Total Levels</strong></td>
          <td>${report.beforeMerge.total}</td>
          <td>${report.afterMerge.total}</td>
          <td class="highlight-success">-${report.summary.duplicatesRemoved}</td>
        </tr>
        <tr>
          <td><strong>Duplicate Groups</strong></td>
          <td>${report.beforeMerge.duplicateGroups}</td>
          <td>0</td>
          <td class="highlight-success">-${report.beforeMerge.duplicateGroups}</td>
        </tr>
        <tr>
          <td><strong>Duplicate Levels</strong></td>
          <td>${report.beforeMerge.duplicateLevels}</td>
          <td>0</td>
          <td class="highlight-success">-${report.beforeMerge.duplicateLevels}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="summary">
    <h2>📂 Source Distribution</h2>
    <h3>Before Merge</h3>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(report.beforeMerge.bySource)
          .filter(([source]) => source !== MapSource.MERGED)
          .map(
            ([source, count]) => `
        <tr>
          <td><span class="source-badge source-${source}">${source.toUpperCase()}</span></td>
          <td>${count}</td>
          <td>${(((count as number) / report.beforeMerge.total) * 100).toFixed(1)}%</td>
        </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <h3>After Merge</h3>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(report.afterMerge.bySource)
          .map(
            ([source, count]) => `
        <tr>
          <td><span class="source-badge source-${source}">${source.toUpperCase()}</span></td>
          <td>${count}</td>
          <td>${(((count as number) / report.afterMerge.total) * 100).toFixed(1)}%</td>
        </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    <p style="margin-top: 20px;">
      <strong>Note:</strong> The MERGED source represents levels that were created by combining metadata from multiple duplicate sources.
      These merged levels preserve the best metadata from Archive.org and Discord while eliminating redundant files.
    </p>
  </div>

  <div class="summary">
    <h2>✅ Merge Benefits Achieved</h2>
    <ul>
      <li>Eliminated ${report.summary.duplicatesRemoved} duplicate files, saving ${report.summary.spaceSavedMB} MB of storage</li>
      <li>Created unified catalog with no duplicate levels</li>
      <li>Preserved professional descriptions from Archive.org</li>
      <li>Maintained accurate timestamps from Discord</li>
      <li>Combined all unique metadata and tags from multiple sources</li>
      <li>Retained original collections for reference</li>
    </ul>
  </div>
</body>
</html>
    `;

    await fs.writeFile(outputPath, html);
  }
}
