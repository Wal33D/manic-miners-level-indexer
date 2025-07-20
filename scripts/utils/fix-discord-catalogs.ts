#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../../src/utils/logger';
import { Level, LevelMetadata } from '../../src/types';

async function fixDiscordCatalogs() {
  const outputDir = path.join(process.cwd(), 'output');
  const discordDirs = [
    path.join(outputDir, 'levels-discord-community'),
    path.join(outputDir, 'levels-discord-archive'),
  ];

  let fixedCount = 0;
  let totalCount = 0;

  for (const discordDir of discordDirs) {
    if (!(await fs.pathExists(discordDir))) {
      logger.info(`Skipping ${path.basename(discordDir)} - directory not found`);
      continue;
    }

    logger.info(`Processing ${path.basename(discordDir)}...`);
    const levelDirs = await fs.readdir(discordDir);

    for (const levelId of levelDirs) {
      const levelDir = path.join(discordDir, levelId);
      const stats = await fs.stat(levelDir);

      if (!stats.isDirectory()) continue;

      totalCount++;

      const catalogPath = path.join(levelDir, 'catalog.json');
      const metadataPath = path.join(levelDir, 'metadata.json');

      // Skip if catalog.json already exists
      if (await fs.pathExists(catalogPath)) {
        logger.debug(`Catalog already exists for ${levelId}`);
        continue;
      }

      // Skip if metadata.json doesn't exist
      if (!(await fs.pathExists(metadataPath))) {
        logger.warn(`No metadata found for ${levelId}`);
        continue;
      }

      try {
        // Read metadata
        const metadata: LevelMetadata = await fs.readJSON(metadataPath);

        // Find the .dat file
        const files = await fs.readdir(levelDir);
        const datFile = files.find(f => f.toLowerCase().endsWith('.dat'));

        if (!datFile) {
          logger.warn(`No .dat file found in ${levelId}`);
          continue;
        }

        const datPath = path.join(levelDir, datFile);
        const datStats = await fs.stat(datPath);

        // Find all image files
        const imageFiles = files.filter(
          f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f) && f !== 'README.md'
        );

        // Construct the Level object
        const level: Level = {
          metadata,
          files: [
            {
              filename: datFile,
              path: path.relative(outputDir, datPath),
              size: datStats.size,
              type: 'dat',
            },
            ...imageFiles.map(img => {
              const imgPath = path.join(levelDir, img);
              const imgStats = fs.statSync(imgPath);
              return {
                filename: img,
                path: path.relative(outputDir, imgPath),
                size: imgStats.size,
                type: 'image' as const,
              };
            }),
          ],
          catalogPath: path.relative(outputDir, path.join(levelDir, 'catalog.json')),
          datFilePath: path.relative(outputDir, datPath),
          indexed: new Date(),
          lastUpdated: new Date(),
        };

        // Write catalog.json
        await fs.writeJSON(catalogPath, level, { spaces: 2 });
        fixedCount++;
        logger.info(`Fixed catalog for ${levelId} - ${metadata.title}`);
      } catch (error) {
        logger.error(`Failed to fix catalog for ${levelId}:`, error);
      }
    }
  }

  logger.success(`Fixed ${fixedCount} out of ${totalCount} Discord levels`);
}

// Run the fix
fixDiscordCatalogs().catch(error => {
  logger.error('Failed to fix Discord catalogs:', error);
  process.exit(1);
});
