#!/usr/bin/env ts-node

import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../src/utils/logger';
import { TestPaths } from '../../src/tests/test-config';

async function cleanTestOutputs(includeProduction = false) {
  const mode = includeProduction ? 'all output' : 'test output';
  logger.info(`Cleaning ${mode} directories...`);

  const directoriesToClean = [
    // New consolidated test output directory
    TestPaths.base,

    // Legacy test directories (can be removed after migration)
    './test-output',
    './test-temp',
    './temp/test',
  ];

  // Add production directories if requested
  if (includeProduction) {
    directoriesToClean.push('./output', './temp');
  }

  for (const dir of directoriesToClean) {
    const absPath = path.resolve(dir);

    if (await fs.pathExists(absPath)) {
      logger.info(`Removing: ${dir}`);
      await fs.remove(absPath);
    } else {
      logger.debug(`Directory not found: ${dir}`);
    }
  }

  // Also clean any temp files that might be scattered
  const rootDir = process.cwd();
  const entries = await fs.readdir(rootDir);

  for (const entry of entries) {
    // Clean test-related temporary files
    if (entry.startsWith('test-') && entry.endsWith('.tmp')) {
      const filePath = path.join(rootDir, entry);
      logger.info(`Removing temporary file: ${entry}`);
      await fs.remove(filePath);
    }
  }

  logger.success(
    `${mode.charAt(0).toUpperCase() + mode.slice(1)} directories cleaned successfully!`
  );
}

// Run if called directly
if (require.main === module) {
  cleanTestOutputs().catch(error => {
    logger.error('Failed to clean test outputs:', error);
    process.exit(1);
  });
}

export { cleanTestOutputs };
