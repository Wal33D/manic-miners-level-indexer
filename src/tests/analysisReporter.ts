import { Level, MapSource } from '../types';
import { ValidationResult, ValidationSummary } from './outputValidator';
import { FileUtils } from '../utils/fileUtils';
import fs from 'fs-extra';
import path from 'path';

export interface AnalysisReport {
  timestamp: Date;
  outputDirectory: string;
  sources: MapSource[];
  levelCount: number;
  totalSize: number;
  statistics: AnalysisStatistics;
  dataQuality: DataQualityMetrics;
  recommendations: string[];
  validationSummary?: ValidationSummary;
}

export interface AnalysisStatistics {
  bySource: Map<MapSource, SourceStatistics>;
  byAuthor: Map<string, number>;
  byFormatVersion: Map<string, number>;
  byYear: Map<number, number>;
  fileSizeDistribution: SizeDistribution;
  tagCloud: Map<string, number>;
}

export interface SourceStatistics {
  levelCount: number;
  totalSize: number;
  averageSize: number;
  oldestLevel: Date | null;
  newestLevel: Date | null;
  uniqueAuthors: number;
  topTags: string[];
}

export interface SizeDistribution {
  min: number;
  max: number;
  average: number;
  median: number;
  buckets: Map<string, number>; // e.g., "0-10KB", "10-50KB", etc.
}

export interface DataQualityMetrics {
  completenessScore: number; // 0-100
  missingMetadataFields: Map<string, number>;
  levelsWithoutDescriptions: number;
  levelsWithoutTags: number;
  levelsWithoutImages: number;
  duplicateLevels: Array<{ title: string; count: number }>;
}

export class AnalysisReporter {
  async analyzeOutput(
    outputDirectory: string,
    validationResults?: ValidationResult[]
  ): Promise<AnalysisReport> {
    const levels = await this.loadAllLevels(outputDirectory);
    const statistics = this.calculateStatistics(levels);
    const dataQuality = this.assessDataQuality(levels);
    const recommendations = this.generateRecommendations(statistics, dataQuality);

    const report: AnalysisReport = {
      timestamp: new Date(),
      outputDirectory,
      sources: Array.from(new Set(levels.map(l => l.metadata.source))),
      levelCount: levels.length,
      totalSize: levels.reduce((sum, l) => sum + this.getLevelSize(l), 0),
      statistics,
      dataQuality,
      recommendations,
    };

    if (validationResults) {
      const validator = await import('./outputValidator');
      const validatorInstance = new validator.OutputValidator();
      report.validationSummary = validatorInstance['generateSummary'](validationResults);
    }

    return report;
  }

  private async loadAllLevels(outputDirectory: string): Promise<Level[]> {
    const levels: Level[] = [];
    const catalogIndexPath = path.join(outputDirectory, 'catalog_index.json');

    if (await fs.pathExists(catalogIndexPath)) {
      // Use catalog index if available
      const catalogIndex = await FileUtils.readJSON<{ levels: string[] }>(catalogIndexPath);
      if (catalogIndex?.levels) {
        for (const levelPath of catalogIndex.levels) {
          const catalog = await FileUtils.readJSON<Level>(levelPath);
          if (catalog) levels.push(catalog);
        }
      }
    } else {
      // Scan directory for catalog.json files
      async function scanDir(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);
            const catalogPath = path.join(fullPath, 'catalog.json');
            if (await fs.pathExists(catalogPath)) {
              const catalog = await FileUtils.readJSON<Level>(catalogPath);
              if (catalog) levels.push(catalog);
            } else {
              await scanDir(fullPath);
            }
          }
        }
      }
      await scanDir(outputDirectory);
    }

    return levels;
  }

  private calculateStatistics(levels: Level[]): AnalysisStatistics {
    const statistics: AnalysisStatistics = {
      bySource: new Map(),
      byAuthor: new Map(),
      byFormatVersion: new Map(),
      byYear: new Map(),
      fileSizeDistribution: this.calculateSizeDistribution(levels),
      tagCloud: new Map(),
    };

    // Initialize source statistics
    for (const source of Object.values(MapSource)) {
      statistics.bySource.set(source, {
        levelCount: 0,
        totalSize: 0,
        averageSize: 0,
        oldestLevel: null,
        newestLevel: null,
        uniqueAuthors: 0,
        topTags: [],
      });
    }

    // Process each level
    const authorsBySource = new Map<MapSource, Set<string>>();
    const tagsBySource = new Map<MapSource, Map<string, number>>();

    for (const level of levels) {
      const source = level.metadata.source;
      const sourceStats = statistics.bySource.get(source)!;
      const levelSize = this.getLevelSize(level);

      // Update source statistics
      sourceStats.levelCount++;
      sourceStats.totalSize += levelSize;

      // Track dates
      const postedDate = level.metadata.postedDate
        ? new Date(level.metadata.postedDate)
        : new Date(level.indexed);
      if (!sourceStats.oldestLevel || postedDate < sourceStats.oldestLevel) {
        sourceStats.oldestLevel = postedDate;
      }
      if (!sourceStats.newestLevel || postedDate > sourceStats.newestLevel) {
        sourceStats.newestLevel = postedDate;
      }

      // Track authors
      const author = level.metadata.author;
      statistics.byAuthor.set(author, (statistics.byAuthor.get(author) || 0) + 1);
      if (!authorsBySource.has(source)) {
        authorsBySource.set(source, new Set());
      }
      authorsBySource.get(source)!.add(author);

      // Track format versions
      const version = level.metadata.formatVersion || 'unknown';
      statistics.byFormatVersion.set(version, (statistics.byFormatVersion.get(version) || 0) + 1);

      // Track years
      const year = postedDate.getFullYear();
      statistics.byYear.set(year, (statistics.byYear.get(year) || 0) + 1);

      // Track tags
      if (level.metadata.tags) {
        if (!tagsBySource.has(source)) {
          tagsBySource.set(source, new Map());
        }
        const sourceTags = tagsBySource.get(source)!;

        for (const tag of level.metadata.tags) {
          statistics.tagCloud.set(tag, (statistics.tagCloud.get(tag) || 0) + 1);
          sourceTags.set(tag, (sourceTags.get(tag) || 0) + 1);
        }
      }
    }

    // Calculate averages and unique authors
    for (const [source, stats] of statistics.bySource) {
      if (stats.levelCount > 0) {
        stats.averageSize = Math.round(stats.totalSize / stats.levelCount);
        stats.uniqueAuthors = authorsBySource.get(source)?.size || 0;

        // Get top tags for this source
        const sourceTags = tagsBySource.get(source);
        if (sourceTags) {
          stats.topTags = Array.from(sourceTags.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag]) => tag);
        }
      }
    }

    return statistics;
  }

  private calculateSizeDistribution(levels: Level[]): SizeDistribution {
    const sizes = levels.map(l => this.getLevelSize(l)).sort((a, b) => a - b);

    if (sizes.length === 0) {
      return {
        min: 0,
        max: 0,
        average: 0,
        median: 0,
        buckets: new Map(),
      };
    }

    const distribution: SizeDistribution = {
      min: sizes[0],
      max: sizes[sizes.length - 1],
      average: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      median: sizes[Math.floor(sizes.length / 2)],
      buckets: new Map(),
    };

    // Define size buckets
    const buckets = [
      { name: '0-10KB', min: 0, max: 10240 },
      { name: '10-50KB', min: 10240, max: 51200 },
      { name: '50-100KB', min: 51200, max: 102400 },
      { name: '100-500KB', min: 102400, max: 512000 },
      { name: '500KB-1MB', min: 512000, max: 1048576 },
      { name: '1MB+', min: 1048576, max: Infinity },
    ];

    // Count levels in each bucket
    for (const bucket of buckets) {
      const count = sizes.filter(s => s >= bucket.min && s < bucket.max).length;
      distribution.buckets.set(bucket.name, count);
    }

    return distribution;
  }

  private assessDataQuality(levels: Level[]): DataQualityMetrics {
    const metrics: DataQualityMetrics = {
      completenessScore: 0,
      missingMetadataFields: new Map(),
      levelsWithoutDescriptions: 0,
      levelsWithoutTags: 0,
      levelsWithoutImages: 0,
      duplicateLevels: [],
    };

    // Track missing fields
    const fieldChecks = [
      'description',
      'postedDate',
      'tags',
      'formatVersion',
      'sourceUrl',
      'originalId',
    ];

    for (const field of fieldChecks) {
      metrics.missingMetadataFields.set(field, 0);
    }

    // Check each level
    const titleCounts = new Map<string, number>();

    for (const level of levels) {
      // Check metadata completeness
      for (const field of fieldChecks) {
        if (!level.metadata[field as keyof typeof level.metadata]) {
          metrics.missingMetadataFields.set(field, metrics.missingMetadataFields.get(field)! + 1);
        }
      }

      // Specific checks
      if (!level.metadata.description || level.metadata.description.length < 10) {
        metrics.levelsWithoutDescriptions++;
      }
      if (!level.metadata.tags || level.metadata.tags.length === 0) {
        metrics.levelsWithoutTags++;
      }
      if (!level.files.some(f => f.type === 'image' || f.type === 'thumbnail')) {
        metrics.levelsWithoutImages++;
      }

      // Track duplicates
      const title = level.metadata.title.toLowerCase();
      titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    }

    // Find duplicates
    for (const [title, count] of titleCounts) {
      if (count > 1) {
        metrics.duplicateLevels.push({ title, count });
      }
    }

    // Calculate completeness score
    if (levels.length > 0) {
      let totalScore = 0;
      const weights = {
        description: 20,
        tags: 15,
        images: 15,
        formatVersion: 10,
        sourceUrl: 10,
        postedDate: 10,
        originalId: 10,
        noDuplicates: 10,
      };

      totalScore += weights.description * (1 - metrics.levelsWithoutDescriptions / levels.length);
      totalScore += weights.tags * (1 - metrics.levelsWithoutTags / levels.length);
      totalScore += weights.images * (1 - metrics.levelsWithoutImages / levels.length);

      for (const [field, weight] of Object.entries(weights)) {
        if (metrics.missingMetadataFields.has(field)) {
          const missing = metrics.missingMetadataFields.get(field)!;
          totalScore += weight * (1 - missing / levels.length);
        }
      }

      totalScore += weights.noDuplicates * (1 - metrics.duplicateLevels.length / titleCounts.size);

      metrics.completenessScore = Math.round(totalScore);
    }

    return metrics;
  }

  private generateRecommendations(
    statistics: AnalysisStatistics,
    dataQuality: DataQualityMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Data quality recommendations
    if (dataQuality.completenessScore < 70) {
      recommendations.push(
        '⚠️ Data quality score is below 70%. Focus on improving metadata completeness.'
      );
    }

    if (dataQuality.levelsWithoutDescriptions > statistics.bySource.size * 5) {
      recommendations.push(
        '📝 Many levels lack descriptions. Consider adding meaningful descriptions.'
      );
    }

    if (dataQuality.levelsWithoutTags > statistics.bySource.size * 5) {
      recommendations.push('🏷️ Many levels lack tags. Add tags to improve discoverability.');
    }

    if (dataQuality.levelsWithoutImages > statistics.bySource.size * 10) {
      recommendations.push('🖼️ Many levels lack preview images. Consider generating thumbnails.');
    }

    if (dataQuality.duplicateLevels.length > 5) {
      recommendations.push('🔄 Found duplicate level titles. Review and deduplicate the catalog.');
    }

    // Source-specific recommendations
    for (const [source, stats] of statistics.bySource) {
      if (stats.levelCount === 0) {
        recommendations.push(`❌ No levels found for ${source}. Check indexer configuration.`);
      } else if (stats.uniqueAuthors === 1) {
        recommendations.push(`👤 Only one author found for ${source}. Expand data collection.`);
      }
    }

    // Format version recommendations
    if (statistics.byFormatVersion.has('unknown')) {
      const unknownCount = statistics.byFormatVersion.get('unknown')!;
      if (unknownCount > 10) {
        recommendations.push(
          '🔍 Many levels have unknown format versions. Improve version detection.'
        );
      }
    }

    return recommendations;
  }

  private getLevelSize(level: Level): number {
    return level.files.reduce((sum, file) => sum + (file.size || 0), 0);
  }

  async generateHTMLReport(report: AnalysisReport, outputPath: string): Promise<void> {
    const html = this.renderHTMLReport(report);
    await fs.writeFile(outputPath, html);
  }

  async generateJSONReport(report: AnalysisReport, outputPath: string): Promise<void> {
    // Convert Maps to objects for JSON serialization
    const jsonReport = {
      ...report,
      statistics: {
        ...report.statistics,
        bySource: Object.fromEntries(report.statistics.bySource),
        byAuthor: Object.fromEntries(report.statistics.byAuthor),
        byFormatVersion: Object.fromEntries(report.statistics.byFormatVersion),
        byYear: Object.fromEntries(report.statistics.byYear),
        fileSizeDistribution: {
          ...report.statistics.fileSizeDistribution,
          buckets: Object.fromEntries(report.statistics.fileSizeDistribution.buckets),
        },
        tagCloud: Object.fromEntries(report.statistics.tagCloud),
      },
      dataQuality: {
        ...report.dataQuality,
        missingMetadataFields: Object.fromEntries(report.dataQuality.missingMetadataFields),
      },
    };

    await FileUtils.writeJSON(outputPath, jsonReport);
  }

  private renderHTMLReport(report: AnalysisReport): string {
    const formatNumber = (n: number) => n.toLocaleString();
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manic Miners Level Indexer - Analysis Report</title>
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
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
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
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #ecf0f1;
            border-radius: 10px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: #3498db;
            transition: width 0.3s;
        }
        .recommendations {
            background: #fff9c4;
            border-left: 4px solid #f57c00;
            padding: 15px;
            margin: 20px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #f8f9fa;
            font-weight: bold;
        }
        .tag {
            display: inline-block;
            padding: 3px 8px;
            margin: 2px;
            background: #e3f2fd;
            border-radius: 4px;
            font-size: 0.85em;
        }
        .error { color: #e74c3c; }
        .warning { color: #f39c12; }
        .success { color: #27ae60; }
    </style>
</head>
<body>
    <h1>Manic Miners Level Indexer - Analysis Report</h1>
    
    <div class="card">
        <h2>Overview</h2>
        <p><strong>Generated:</strong> ${report.timestamp.toLocaleString()}</p>
        <p><strong>Output Directory:</strong> <code>${report.outputDirectory}</code></p>
        <p><strong>Sources:</strong> ${report.sources.join(', ')}</p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${formatNumber(report.levelCount)}</div>
            <div class="stat-label">Total Levels</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatSize(report.totalSize)}</div>
            <div class="stat-label">Total Size</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${report.dataQuality.completenessScore}%</div>
            <div class="stat-label">Data Quality Score</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${report.dataQuality.completenessScore}%"></div>
            </div>
        </div>
    </div>

    <div class="card">
        <h2>Source Statistics</h2>
        <table>
            <thead>
                <tr>
                    <th>Source</th>
                    <th>Levels</th>
                    <th>Total Size</th>
                    <th>Avg Size</th>
                    <th>Authors</th>
                    <th>Top Tags</th>
                </tr>
            </thead>
            <tbody>
                ${Array.from(report.statistics.bySource)
                  .map(
                    ([source, stats]) => `
                    <tr>
                        <td>${source}</td>
                        <td>${formatNumber(stats.levelCount)}</td>
                        <td>${formatSize(stats.totalSize)}</td>
                        <td>${formatSize(stats.averageSize)}</td>
                        <td>${stats.uniqueAuthors}</td>
                        <td>${stats.topTags.map(tag => `<span class="tag">${tag}</span>`).join('')}</td>
                    </tr>
                `
                  )
                  .join('')}
            </tbody>
        </table>
    </div>

    <div class="card">
        <h2>Data Quality Metrics</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${report.dataQuality.levelsWithoutDescriptions}</div>
                <div class="stat-label">Levels Without Descriptions</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.dataQuality.levelsWithoutTags}</div>
                <div class="stat-label">Levels Without Tags</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.dataQuality.levelsWithoutImages}</div>
                <div class="stat-label">Levels Without Images</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.dataQuality.duplicateLevels.length}</div>
                <div class="stat-label">Duplicate Titles</div>
            </div>
        </div>
    </div>

    <div class="card">
        <h2>File Size Distribution</h2>
        <table>
            <thead>
                <tr>
                    <th>Size Range</th>
                    <th>Count</th>
                    <th>Percentage</th>
                </tr>
            </thead>
            <tbody>
                ${Array.from(report.statistics.fileSizeDistribution.buckets)
                  .map(
                    ([range, count]) => `
                    <tr>
                        <td>${range}</td>
                        <td>${count}</td>
                        <td>${((count / report.levelCount) * 100).toFixed(1)}%</td>
                    </tr>
                `
                  )
                  .join('')}
            </tbody>
        </table>
    </div>

    ${
      report.recommendations.length > 0
        ? `
        <div class="recommendations">
            <h2>Recommendations</h2>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    `
        : ''
    }

    ${
      report.validationSummary
        ? `
        <div class="card">
            <h2>Validation Summary</h2>
            <p class="success">Valid levels: ${report.validationSummary.validLevels} / ${
              report.validationSummary.totalLevels
            }</p>
            <p class="error">Levels with errors: ${report.validationSummary.levelsWithErrors}</p>
            <p class="warning">Levels with warnings: ${
              report.validationSummary.levelsWithWarnings
            }</p>
        </div>
    `
        : ''
    }
</body>
</html>
    `;
  }
}
