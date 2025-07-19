import fs from 'fs-extra';
import { logger } from './logger';
import { MapSource } from '../types';

/**
 * Detects the format version of a Manic Miners DAT file
 * below-v1: Levels from archive.org or discord (older format)
 * v1 and above: Levels from hognose (newer format)
 */
export class DatVersionDetector {
  /**
   * Detects the version based on the source
   * @param source The source of the level
   * @returns Format version
   */
  static getVersionBySource(source: MapSource): 'below-v1' | 'v1' | 'v2' | 'unknown' {
    switch (source) {
      case MapSource.INTERNET_ARCHIVE:
      case MapSource.DISCORD_COMMUNITY:
      case MapSource.DISCORD_ARCHIVE:
        // Levels from archive.org or discord are below v1
        return 'below-v1';
      case MapSource.HOGNOSE:
        // Hognose levels are v1 or above
        // Could be refined further based on file analysis or metadata
        return 'v1';
      default:
        return 'unknown';
    }
  }

  /**
   * Detects the version of a DAT file by analyzing its structure
   * @param datFilePath Path to the DAT file
   * @param source The source of the level
   * @returns Format version
   */
  static async detectVersion(
    datFilePath: string,
    source?: MapSource
  ): Promise<'below-v1' | 'v1' | 'v2' | 'unknown'> {
    // If source is provided, use source-based detection
    if (source) {
      return this.getVersionBySource(source);
    }

    try {
      const buffer = await fs.readFile(datFilePath);

      // For files without source info, try to detect based on content
      // This is a fallback for when source isn't available

      // Check file size - below-v1 files tend to be smaller
      const fileSize = buffer.length;

      // Simple heuristics based on file structure
      // These would need to be adjusted based on actual DAT format differences

      // Check for potential v2 markers
      if (this.hasV2Markers(buffer)) {
        return 'v2';
      }

      // Check for v1 characteristics
      if (this.hasV1Characteristics(buffer)) {
        return 'v1';
      }

      // Check for below-v1 characteristics
      if (this.hasBelowV1Characteristics(buffer)) {
        return 'below-v1';
      }

      // If we can't determine the version, return unknown
      return 'unknown';
    } catch (error) {
      logger.error(`Failed to detect DAT version for ${datFilePath}:`, error);
      return 'unknown';
    }
  }

  /**
   * Checks for v2 format markers in the buffer
   */
  private static hasV2Markers(buffer: Buffer): boolean {
    // Example checks for v2 format
    // These would need to be based on actual format specifications

    // Check for larger file size typical of v2
    if (buffer.length > 100000) {
      return true;
    }

    // Check for specific byte patterns that indicate v2
    // For example, v2 might have additional data sections

    return false;
  }

  /**
   * Checks for v1 format characteristics
   */
  private static hasV1Characteristics(buffer: Buffer): boolean {
    // v1 files are medium-sized, between below-v1 and v2
    if (buffer.length >= 30000 && buffer.length < 100000) {
      return true;
    }

    return false;
  }

  /**
   * Checks for below-v1 format characteristics
   */
  private static hasBelowV1Characteristics(buffer: Buffer): boolean {
    // below-v1 files tend to be smaller
    if (buffer.length < 30000) {
      return true;
    }

    return false;
  }

  /**
   * Gets version information from filename if present
   * Some files might have version indicators in their names
   */
  static getVersionFromFilename(filename: string): 'below-v1' | 'v1' | 'v2' | 'unknown' {
    const lowerName = filename.toLowerCase();

    // Check for explicit version indicators in filename
    if (lowerName.includes('_v2') || lowerName.includes('-v2')) {
      return 'v2';
    }

    if (lowerName.includes('_v1') || lowerName.includes('-v1')) {
      return 'v1';
    }

    // Check for "old_version_" prefix which indicates below-v1
    if (lowerName.includes('old_version_') || lowerName.includes('old_')) {
      return 'below-v1';
    }

    return 'unknown';
  }

  /**
   * Detects version using multiple methods
   */
  static async detectVersionComprehensive(
    datFilePath: string,
    source?: MapSource
  ): Promise<'below-v1' | 'v1' | 'v2' | 'unknown'> {
    // If source is provided, prioritize source-based detection
    if (source) {
      const sourceVersion = this.getVersionBySource(source);
      logger.debug(`Detected version ${sourceVersion} from source: ${source}`);
      return sourceVersion;
    }

    // Try filename-based detection
    const filename = datFilePath.split('/').pop() || '';
    const filenameVersion = this.getVersionFromFilename(filename);

    if (filenameVersion !== 'unknown') {
      logger.debug(`Detected version ${filenameVersion} from filename: ${filename}`);
      return filenameVersion;
    }

    // Fall back to content-based detection
    const contentVersion = await this.detectVersion(datFilePath, source);
    logger.debug(`Detected version ${contentVersion} from file content: ${datFilePath}`);

    return contentVersion;
  }
}
