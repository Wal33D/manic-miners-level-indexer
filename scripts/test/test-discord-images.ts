#!/usr/bin/env npx tsx

import { DiscordUnifiedIndexer } from '../../src/indexers/discordUnified';
import { logger } from '../../src/utils/logger';
import { FileUtils } from '../../src/utils/fileUtils';
import path from 'path';
import fs from 'fs/promises';

async function testDiscordImages() {
  try {
    logger.info('Testing Discord indexer with image support...');

    const outputDir = path.join(__dirname, '../outputs/discord-image-test');
    await FileUtils.ensureDir(outputDir);

    // Discord channels - you can modify these to test specific channels
    const channels = [
      '1171536424451686451', // #build-releases
    ];

    const indexer = new DiscordUnifiedIndexer(channels, outputDir);

    // Initialize the indexer
    await indexer.initialize();

    // Run the indexing with progress callback
    const result = await indexer.indexDiscord(progress => {
      logger.info(`${progress.phase}: ${progress.message}`);
    });

    if (result.success) {
      logger.success(`Indexing completed successfully!`);
      logger.info(`Levels processed: ${result.levelsProcessed}`);
      logger.info(`Levels skipped: ${result.levelsSkipped}`);

      // Check for levels with images
      const catalogPath = path.join(outputDir, 'levels', 'discord');
      const levelDirs = await fs.readdir(catalogPath);

      let levelsWithImages = 0;
      let totalImages = 0;

      for (const levelDir of levelDirs) {
        const catalogFile = path.join(catalogPath, levelDir, 'catalog.json');
        const level = await FileUtils.readJSON<any>(catalogFile);

        if (level && level.files) {
          const imageFiles = level.files.filter(
            (file: any) => file.type === 'image' || file.type === 'thumbnail'
          );

          if (imageFiles.length > 0) {
            levelsWithImages++;
            totalImages += imageFiles.length;
            logger.info(`Level ${level.metadata.title} has ${imageFiles.length} image(s):`);
            imageFiles.forEach((img: any) => {
              logger.info(`  - ${img.filename} (${img.type})`);
            });
          }
        }
      }

      logger.success(`\nSummary:`);
      logger.info(`Total levels with images: ${levelsWithImages}`);
      logger.info(`Total images downloaded: ${totalImages}`);
    } else {
      logger.error('Indexing failed!');
      result.errors.forEach(error => logger.error(error));
    }
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testDiscordImages().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
