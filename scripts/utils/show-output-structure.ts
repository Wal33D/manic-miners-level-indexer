#!/usr/bin/env ts-node

import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../src/utils/logger';
import { getAllSourceLevelsDirs } from '../../src/utils/sourceUtils';

async function showOutputStructure() {
  const outputDir = './data';

  logger.info('Current Output Directory Structure:');
  logger.info('==================================');

  // Check if output directory exists
  if (!(await fs.pathExists(outputDir))) {
    logger.warn('Output directory does not exist yet');
    return;
  }

  // Show source-specific directories
  const sourceDirs = getAllSourceLevelsDirs();

  for (const sourceDir of sourceDirs) {
    const dirPath = path.join(outputDir, sourceDir);

    if (await fs.pathExists(dirPath)) {
      const entries = await fs.readdir(dirPath);
      const levelCount = entries.filter(async entry => {
        const entryPath = path.join(dirPath, entry);
        const stat = await fs.stat(entryPath);
        return stat.isDirectory();
      }).length;

      logger.info(`📁 ${sourceDir}/`);
      logger.info(`   └── ${levelCount} levels`);

      // Check for catalog file
      const catalogPath = path.join(dirPath, `catalog-${sourceDir.replace('levels-', '')}.json`);
      if (await fs.pathExists(catalogPath)) {
        logger.info(`   └── ✓ Source catalog exists`);
      }
    } else {
      logger.info(`📁 ${sourceDir}/ (not created yet)`);
    }
  }

  // Check for master catalog
  const masterCatalogPath = path.join(outputDir, 'catalog_index.json');
  if (await fs.pathExists(masterCatalogPath)) {
    logger.info('\n📄 Master catalog exists');
  }

  const masterIndexPath = path.join(outputDir, 'master_index.json');
  if (await fs.pathExists(masterIndexPath)) {
    logger.info('📄 Master index exists');
  }
}

// Run if called directly
if (require.main === module) {
  showOutputStructure().catch(error => {
    logger.error('Failed to show output structure:', error);
    process.exit(1);
  });
}

export { showOutputStructure };
