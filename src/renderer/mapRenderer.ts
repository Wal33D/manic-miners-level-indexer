import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { MapData, TileData, Biome, Level } from '../types';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/fileUtils';
import { BIOME_MAPPINGS, defaultConfig } from '../config/default';
import path from 'path';
import fs from 'fs-extra';

export class MapRenderer {
  private biomeColors: Record<string, string>;
  private thumbnailSize: { width: number; height: number };
  private screenshotSize: { width: number; height: number };

  constructor(config = defaultConfig.rendering) {
    this.biomeColors = config.biomeColors;
    this.thumbnailSize = config.thumbnailSize;
    this.screenshotSize = config.screenshotSize;
  }

  async renderLevel(
    level: Level,
    generateThumbnail = true,
    generateScreenshot = true
  ): Promise<void> {
    try {
      logger.info(`Rendering level: ${level.metadata.title}`);

      // Parse the .dat file to get map data
      const mapData = await this.parseDatFile(level.datFilePath);
      if (!mapData) {
        logger.warn(`Failed to parse .dat file for level: ${level.metadata.title}`);
        return;
      }

      // Generate screenshot if requested
      if (generateScreenshot) {
        const screenshotPath = path.join(level.catalogPath, 'screenshot.png');
        await this.generateScreenshot(mapData, screenshotPath);
        level.screenshotPath = screenshotPath;
        logger.debug(`Generated screenshot: ${screenshotPath}`);
      }

      // Generate thumbnail if requested
      if (generateThumbnail) {
        const thumbnailPath = path.join(level.catalogPath, 'thumbnail.png');
        await this.generateThumbnail(mapData, thumbnailPath);
        level.thumbnailPath = thumbnailPath;
        logger.debug(`Generated thumbnail: ${thumbnailPath}`);
      }
    } catch (error) {
      logger.error(`Failed to render level ${level.metadata.title}:`, error);
      throw error;
    }
  }

  private async parseDatFile(datFilePath: string): Promise<MapData | null> {
    try {
      const buffer = await fs.readFile(datFilePath);

      // Basic .dat file parsing (simplified version)
      // In a real implementation, this would need proper binary parsing
      // based on the actual Manic Miners .dat file format

      if (buffer.length < 8) {
        logger.warn(`Invalid .dat file: ${datFilePath} (too small)`);
        return null;
      }

      // Read header (simplified)
      const width = buffer.readUInt32LE(0);
      const height = buffer.readUInt32LE(4);

      if (width > 1000 || height > 1000 || width <= 0 || height <= 0) {
        logger.warn(`Invalid map dimensions: ${width}x${height} in ${datFilePath}`);
        return null;
      }

      // Create tile data array
      const tiles: TileData[][] = [];
      let offset = 8;

      for (let y = 0; y < height; y++) {
        const row: TileData[] = [];
        for (let x = 0; x < width; x++) {
          if (offset >= buffer.length) {
            // If we run out of data, fill with default tiles
            row.push({
              x,
              y,
              biome: 0, // Default to rock
              height: 0,
            });
          } else {
            const tileData = buffer.readUInt8(offset);
            row.push({
              x,
              y,
              biome: tileData % 19, // Assuming 19 biome types
              height: Math.floor(tileData / 19),
            });
            offset++;
          }
        }
        tiles.push(row);
      }

      // Create biome definitions
      const biomes: Biome[] = [];
      for (let i = 0; i < 19; i++) {
        const biomeName = BIOME_MAPPINGS[i] || 'unknown';
        biomes.push({
          id: i,
          name: biomeName,
          color: this.biomeColors[biomeName] || '#808080',
        });
      }

      return {
        width,
        height,
        tiles,
        biomes,
        objectives: [], // Would be parsed from the file
        requirements: [], // Would be parsed from the file
      };
    } catch (error) {
      logger.error(`Failed to parse .dat file ${datFilePath}:`, error);
      return null;
    }
  }

  private async generateScreenshot(mapData: MapData, outputPath: string): Promise<void> {
    try {
      const canvas = createCanvas(this.screenshotSize.width, this.screenshotSize.height);
      const ctx = canvas.getContext('2d');

      await this.renderMap(ctx, mapData, this.screenshotSize);

      // Save as PNG
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);
    } catch (error) {
      logger.error(`Failed to generate screenshot at ${outputPath}:`, error);
      throw error;
    }
  }

  private async generateThumbnail(mapData: MapData, outputPath: string): Promise<void> {
    try {
      const canvas = createCanvas(this.thumbnailSize.width, this.thumbnailSize.height);
      const ctx = canvas.getContext('2d');

      await this.renderMap(ctx, mapData, this.thumbnailSize);

      // Save as PNG
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);
    } catch (error) {
      logger.error(`Failed to generate thumbnail at ${outputPath}:`, error);
      throw error;
    }
  }

  private async renderMap(
    ctx: CanvasRenderingContext2D,
    mapData: MapData,
    size: { width: number; height: number }
  ): Promise<void> {
    try {
      // Clear canvas with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size.width, size.height);

      // Calculate tile size
      const tileWidth = size.width / mapData.width;
      const tileHeight = size.height / mapData.height;

      // Render tiles
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const tile = mapData.tiles[y][x];
          const biome = mapData.biomes.find(b => b.id === tile.biome);

          if (biome) {
            ctx.fillStyle = biome.color;

            // Add height-based shading
            const heightShade = Math.max(0, Math.min(255, 128 + tile.height * 10));
            const color = this.adjustColorBrightness(biome.color, heightShade / 255);
            ctx.fillStyle = color;

            // Draw tile
            ctx.fillRect(
              x * tileWidth,
              y * tileHeight,
              Math.ceil(tileWidth),
              Math.ceil(tileHeight)
            );

            // Add subtle border for better visibility
            if (tileWidth > 2 && tileHeight > 2) {
              ctx.strokeStyle = this.adjustColorBrightness(biome.color, 0.8);
              ctx.lineWidth = 0.5;
              ctx.strokeRect(
                x * tileWidth,
                y * tileHeight,
                Math.ceil(tileWidth),
                Math.ceil(tileHeight)
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to render map:', error);
      throw error;
    }
  }

  private adjustColorBrightness(color: string, factor: number): string {
    // Convert hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Adjust brightness
    const newR = Math.max(0, Math.min(255, Math.round(r * factor)));
    const newG = Math.max(0, Math.min(255, Math.round(g * factor)));
    const newB = Math.max(0, Math.min(255, Math.round(b * factor)));

    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  async renderLevelDirectory(levelDir: string): Promise<void> {
    try {
      const catalogPath = path.join(levelDir, 'catalog.json');
      const level = await FileUtils.readJSON<Level>(catalogPath);

      if (!level) {
        logger.warn(`No catalog found in directory: ${levelDir}`);
        return;
      }

      await this.renderLevel(level);

      // Update catalog with new file paths
      await FileUtils.writeJSON(catalogPath, level);
    } catch (error) {
      logger.error(`Failed to render level directory ${levelDir}:`, error);
      throw error;
    }
  }

  async renderAllLevels(
    outputDir: string,
    progressCallback?: (current: number, total: number, levelName: string) => void
  ): Promise<void> {
    try {
      const levelsDir = path.join(outputDir, 'levels');
      const levelDirectories = await FileUtils.listDirectories(levelsDir);

      logger.info(`Rendering ${levelDirectories.length} levels...`);

      for (let i = 0; i < levelDirectories.length; i++) {
        const levelDir = path.join(levelsDir, levelDirectories[i]);

        try {
          const catalogPath = path.join(levelDir, 'catalog.json');
          const level = await FileUtils.readJSON<Level>(catalogPath);

          if (level) {
            await this.renderLevel(level);
            await FileUtils.writeJSON(catalogPath, level);

            progressCallback?.(i + 1, levelDirectories.length, level.metadata.title);
          }
        } catch (error) {
          logger.error(`Failed to render level in ${levelDir}:`, error);
        }
      }

      logger.success(`Completed rendering ${levelDirectories.length} levels`);
    } catch (error) {
      logger.error(`Failed to render all levels:`, error);
      throw error;
    }
  }
}
