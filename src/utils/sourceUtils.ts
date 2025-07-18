import { MapSource } from '../types';

/**
 * Get the directory name for a specific source
 */
export function getSourceLevelsDir(source: MapSource): string {
  switch (source) {
    case MapSource.ARCHIVE:
      return 'levels-archive';
    case MapSource.DISCORD:
      return 'levels-discord';
    case MapSource.HOGNOSE:
      return 'levels-hognose';
    default:
      throw new Error(`Unknown source: ${source}`);
  }
}

/**
 * Get all source level directory names
 */
export function getAllSourceLevelsDirs(): string[] {
  return Object.values(MapSource).map(source => getSourceLevelsDir(source));
}
