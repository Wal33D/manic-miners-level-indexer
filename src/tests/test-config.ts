import path from 'path';

/**
 * Centralized configuration for all test output directories.
 * This ensures all tests use a consistent directory structure.
 */

// Base directory for ALL test outputs
const TEST_OUTPUT_BASE = path.join(process.cwd(), '.test-outputs');

export const TestPaths = {
  // Base test output directory
  base: TEST_OUTPUT_BASE,

  // Unit test outputs
  unit: {
    base: path.join(TEST_OUTPUT_BASE, 'unit'),
    configManager: path.join(TEST_OUTPUT_BASE, 'unit', 'config-manager'),
    fileUtils: path.join(TEST_OUTPUT_BASE, 'unit', 'file-utils'),
  },

  // Integration test outputs
  integration: {
    base: path.join(TEST_OUTPUT_BASE, 'integration'),
    discord: path.join(TEST_OUTPUT_BASE, 'integration', 'discord'),
    hognose: path.join(TEST_OUTPUT_BASE, 'integration', 'hognose'),
    archive: path.join(TEST_OUTPUT_BASE, 'integration', 'archive'),
    all: path.join(TEST_OUTPUT_BASE, 'integration', 'all-indexers'),
    verification: path.join(TEST_OUTPUT_BASE, 'integration', 'verification'),
  },

  // Temporary files during tests
  temp: {
    base: path.join(TEST_OUTPUT_BASE, 'temp'),
    unit: path.join(TEST_OUTPUT_BASE, 'temp', 'unit'),
    integration: path.join(TEST_OUTPUT_BASE, 'temp', 'integration'),
  },

  // Test artifacts (screenshots, logs, etc.)
  artifacts: {
    base: path.join(TEST_OUTPUT_BASE, 'artifacts'),
    screenshots: path.join(TEST_OUTPUT_BASE, 'artifacts', 'screenshots'),
    logs: path.join(TEST_OUTPUT_BASE, 'artifacts', 'logs'),
    coverage: path.join(TEST_OUTPUT_BASE, 'artifacts', 'coverage'),
  },
};

/**
 * Get output directory for a specific test
 */
export function getTestOutputDir(category: 'unit' | 'integration', testName: string): string {
  return path.join(TestPaths[category].base, testName);
}

/**
 * Get temp directory for a specific test
 */
export function getTestTempDir(category: 'unit' | 'integration', testName: string): string {
  return path.join(TestPaths.temp[category], testName);
}
