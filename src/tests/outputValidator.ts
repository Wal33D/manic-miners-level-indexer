import { Level, LevelMetadata, MapSource, LevelFile } from '../types';
import { FileUtils } from '../utils/fileUtils';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: ValidationMetadata;
}

export interface ValidationMetadata {
  levelId: string;
  title: string;
  source: MapSource;
  hasAllRequiredFields: boolean;
  missingFields: string[];
  fileCount: number;
  totalSize: number;
  hasDatFile: boolean;
  hasImages: boolean;
  formatVersion?: string;
}

export interface ValidationSummary {
  totalLevels: number;
  validLevels: number;
  levelsWithErrors: number;
  levelsWithWarnings: number;
  commonErrors: Map<string, number>;
  commonWarnings: Map<string, number>;
  bySource: Map<MapSource, SourceValidationStats>;
}

export interface SourceValidationStats {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
  averageFileSize: number;
  formatVersions: Map<string, number>;
}

export class OutputValidator {
  private requiredMetadataFields = ['id', 'title', 'author', 'source'];
  private recommendedMetadataFields = ['description', 'postedDate', 'tags', 'formatVersion'];
  private requiredLevelFields = ['indexed', 'lastUpdated'];

  async validateLevel(levelPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Partial<ValidationMetadata> = {};

    try {
      // Check if catalog.json exists
      const catalogPath = path.join(levelPath, 'catalog.json');
      if (!(await fs.pathExists(catalogPath))) {
        errors.push('Missing catalog.json file');
        return {
          valid: false,
          errors,
          warnings,
          metadata: metadata as ValidationMetadata,
        };
      }

      // Load and validate catalog
      const level = await FileUtils.readJSON<Level>(catalogPath);
      if (!level) {
        errors.push('Failed to parse catalog.json');
        return {
          valid: false,
          errors,
          warnings,
          metadata: metadata as ValidationMetadata,
        };
      }

      // Basic metadata
      metadata.levelId = level.metadata.id;
      metadata.title = level.metadata.title;
      metadata.source = level.metadata.source;
      metadata.formatVersion = level.metadata.formatVersion;

      // Validate required metadata fields
      const missingFields: string[] = [];
      for (const field of this.requiredMetadataFields) {
        if (!(field in level.metadata) || !level.metadata[field as keyof LevelMetadata]) {
          missingFields.push(field);
          errors.push(`Missing required metadata field: ${field}`);
        }
      }

      // Check recommended fields
      for (const field of this.recommendedMetadataFields) {
        if (!(field in level.metadata) || !level.metadata[field as keyof LevelMetadata]) {
          warnings.push(`Missing recommended metadata field: ${field}`);
        }
      }

      // Validate required level fields (at root level, not in metadata)
      for (const field of this.requiredLevelFields) {
        if (!(field in level) || !level[field as keyof Level]) {
          errors.push(`Missing required level field: ${field}`);
        }
      }

      metadata.missingFields = missingFields;
      metadata.hasAllRequiredFields = missingFields.length === 0;

      // Validate files
      if (!level.files || !Array.isArray(level.files)) {
        errors.push('Missing or invalid files array');
      } else {
        metadata.fileCount = level.files.length;
        metadata.totalSize = 0;
        metadata.hasDatFile = false;
        metadata.hasImages = false;

        for (const file of level.files) {
          const validationResult = await this.validateFile(file, levelPath);
          errors.push(...validationResult.errors);
          warnings.push(...validationResult.warnings);

          if (file.type === 'dat') {
            metadata.hasDatFile = true;
          }
          if (file.type === 'image' || file.type === 'thumbnail') {
            metadata.hasImages = true;
          }
          metadata.totalSize += file.size || 0;
        }

        if (!metadata.hasDatFile) {
          errors.push('No .dat file found in level');
        }
      }

      // Validate paths
      if (level.catalogPath !== levelPath) {
        warnings.push(`Catalog path mismatch: expected ${levelPath}, got ${level.catalogPath}`);
      }

      // Validate dates
      if (level.indexed) {
        const indexedDate = new Date(level.indexed);
        if (isNaN(indexedDate.getTime())) {
          errors.push('Invalid indexed date');
        }
      }

      // Source-specific validation
      const sourceValidation = this.validateSourceSpecific(level);
      errors.push(...sourceValidation.errors);
      warnings.push(...sourceValidation.warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: metadata as ValidationMetadata,
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return {
        valid: false,
        errors,
        warnings,
        metadata: metadata as ValidationMetadata,
      };
    }
  }

  private async validateFile(
    file: LevelFile,
    levelPath: string
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required file fields
    if (!file.filename) {
      errors.push('File missing filename');
    }
    if (!file.path) {
      errors.push('File missing path');
    }
    if (!file.type) {
      warnings.push('File missing type');
    }

    // Check if file exists
    if (file.path) {
      const exists = await fs.pathExists(file.path);
      if (!exists) {
        // Try relative path
        const relativePath = path.join(levelPath, file.filename);
        if (await fs.pathExists(relativePath)) {
          warnings.push(`File path is absolute but should be relative: ${file.filename}`);
        } else {
          errors.push(`File not found: ${file.filename}`);
        }
      } else {
        // Verify file size
        const stats = await fs.stat(file.path);
        if (file.size && Math.abs(stats.size - file.size) > 1) {
          errors.push(
            `File size mismatch for ${file.filename}: expected ${file.size}, got ${stats.size}`
          );
        }

        // Verify hash if provided
        if (file.hash) {
          const actualHash = await this.calculateFileHash(file.path);
          if (actualHash !== file.hash) {
            errors.push(`File hash mismatch for ${file.filename}`);
          }
        } else {
          warnings.push(`No hash provided for ${file.filename}`);
        }
      }
    }

    return { errors, warnings };
  }

  private validateSourceSpecific(level: Level): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (level.metadata.source) {
      case MapSource.ARCHIVE:
        if (!level.metadata.sourceUrl?.includes('archive.org')) {
          warnings.push('Archive.org level missing proper sourceUrl');
        }
        if (!level.metadata.originalId) {
          warnings.push('Archive.org level missing originalId');
        }
        break;

      case MapSource.DISCORD:
        if (!level.metadata.sourceUrl?.includes('discord.com')) {
          warnings.push('Discord level missing proper sourceUrl');
        }
        if (!level.metadata.originalId) {
          warnings.push('Discord level missing message ID');
        }
        break;

      case MapSource.HOGNOSE:
        if (!level.metadata.releaseId) {
          warnings.push('Hognose level missing releaseId');
        }
        if (!level.metadata.sourceUrl?.includes('github.com')) {
          warnings.push('Hognose level missing GitHub URL');
        }
        break;
    }

    return { errors, warnings };
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  async validateDirectory(
    directory: string,
    source?: MapSource
  ): Promise<{
    results: ValidationResult[];
    summary: ValidationSummary;
  }> {
    const results: ValidationResult[] = [];
    const levelDirs = await this.findLevelDirectories(directory, source);

    for (const levelDir of levelDirs) {
      const result = await this.validateLevel(levelDir);
      results.push(result);
    }

    const summary = this.generateSummary(results);
    return { results, summary };
  }

  private async findLevelDirectories(directory: string, source?: MapSource): Promise<string[]> {
    const levelDirs: string[] = [];

    async function scanDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          const catalogPath = path.join(fullPath, 'catalog.json');

          if (await fs.pathExists(catalogPath)) {
            if (source) {
              // Check if this level matches the requested source
              const catalog = await FileUtils.readJSON<Level>(catalogPath);
              if (catalog?.metadata.source === source) {
                levelDirs.push(fullPath);
              }
            } else {
              levelDirs.push(fullPath);
            }
          } else {
            // Recursively scan subdirectories
            await scanDir(fullPath);
          }
        }
      }
    }

    await scanDir(directory);
    return levelDirs;
  }

  private generateSummary(results: ValidationResult[]): ValidationSummary {
    const summary: ValidationSummary = {
      totalLevels: results.length,
      validLevels: results.filter(r => r.valid).length,
      levelsWithErrors: results.filter(r => r.errors.length > 0).length,
      levelsWithWarnings: results.filter(r => r.warnings.length > 0).length,
      commonErrors: new Map(),
      commonWarnings: new Map(),
      bySource: new Map(),
    };

    // Count common errors and warnings
    for (const result of results) {
      for (const error of result.errors) {
        const count = summary.commonErrors.get(error) || 0;
        summary.commonErrors.set(error, count + 1);
      }
      for (const warning of result.warnings) {
        const count = summary.commonWarnings.get(warning) || 0;
        summary.commonWarnings.set(warning, count + 1);
      }

      // Group by source
      const source = result.metadata.source;
      if (!summary.bySource.has(source)) {
        summary.bySource.set(source, {
          total: 0,
          valid: 0,
          withErrors: 0,
          withWarnings: 0,
          averageFileSize: 0,
          formatVersions: new Map(),
        });
      }

      const sourceStats = summary.bySource.get(source)!;
      sourceStats.total++;
      if (result.valid) sourceStats.valid++;
      if (result.errors.length > 0) sourceStats.withErrors++;
      if (result.warnings.length > 0) sourceStats.withWarnings++;

      // Track format versions
      if (result.metadata.formatVersion) {
        const versionCount = sourceStats.formatVersions.get(result.metadata.formatVersion) || 0;
        sourceStats.formatVersions.set(result.metadata.formatVersion, versionCount + 1);
      }
    }

    // Calculate average file sizes
    for (const [source, stats] of summary.bySource) {
      const sourceLevels = results.filter(r => r.metadata.source === source);
      const totalSize = sourceLevels.reduce((sum, r) => sum + (r.metadata.totalSize || 0), 0);
      stats.averageFileSize = stats.total > 0 ? Math.round(totalSize / stats.total) : 0;
    }

    return summary;
  }

  formatSummary(summary: ValidationSummary): string {
    const lines: string[] = [
      '=== Validation Summary ===',
      `Total levels: ${summary.totalLevels}`,
      `Valid levels: ${summary.validLevels} (${((summary.validLevels / summary.totalLevels) * 100).toFixed(1)}%)`,
      `Levels with errors: ${summary.levelsWithErrors}`,
      `Levels with warnings: ${summary.levelsWithWarnings}`,
      '',
    ];

    if (summary.bySource.size > 0) {
      lines.push('By Source:');
      for (const [source, stats] of summary.bySource) {
        lines.push(`  ${source}:`);
        lines.push(`    Total: ${stats.total}`);
        lines.push(
          `    Valid: ${stats.valid} (${((stats.valid / stats.total) * 100).toFixed(1)}%)`
        );
        lines.push(`    Average size: ${(stats.averageFileSize / 1024).toFixed(1)} KB`);
        if (stats.formatVersions.size > 0) {
          lines.push(`    Format versions: ${Array.from(stats.formatVersions.keys()).join(', ')}`);
        }
      }
      lines.push('');
    }

    if (summary.commonErrors.size > 0) {
      lines.push('Common Errors:');
      const sortedErrors = Array.from(summary.commonErrors.entries()).sort((a, b) => b[1] - a[1]);
      for (const [error, count] of sortedErrors.slice(0, 5)) {
        lines.push(`  - ${error} (${count} occurrences)`);
      }
      lines.push('');
    }

    if (summary.commonWarnings.size > 0) {
      lines.push('Common Warnings:');
      const sortedWarnings = Array.from(summary.commonWarnings.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      for (const [warning, count] of sortedWarnings.slice(0, 5)) {
        lines.push(`  - ${warning} (${count} occurrences)`);
      }
    }

    return lines.join('\n');
  }
}
