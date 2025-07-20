import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../src/utils/logger';

interface TestStep {
  name: string;
  command: string;
  critical: boolean; // If true, stop on failure
}

const testSteps: TestStep[] = [
  {
    name: 'TypeScript Type Check',
    command: 'npm run type-check',
    critical: true,
  },
  {
    name: 'ESLint',
    command: 'npm run lint:check',
    critical: true,
  },
  {
    name: 'Prettier Format Check',
    command: 'npm run format:check',
    critical: false,
  },
  {
    name: 'Unit Tests',
    command: 'npm test',
    critical: true,
  },
  {
    name: 'Integration Tests - Quick',
    command: 'npm run test:quick',
    critical: false,
  },
];

async function runFullTestSuite() {
  logger.info(chalk.blue.bold('\n🧪 Running Full Test Suite\n'));

  const results: { step: string; success: boolean; duration: number }[] = [];
  let allPassed = true;

  for (const step of testSteps) {
    logger.info(chalk.yellow(`\n📋 ${step.name}...`));
    const startTime = Date.now();

    try {
      execSync(step.command, { stdio: 'inherit' });
      const duration = Date.now() - startTime;
      results.push({ step: step.name, success: true, duration });
      logger.success(chalk.green(`✅ ${step.name} passed (${(duration / 1000).toFixed(2)}s)`));
    } catch {
      const duration = Date.now() - startTime;
      results.push({ step: step.name, success: false, duration });
      logger.error(chalk.red(`❌ ${step.name} failed (${(duration / 1000).toFixed(2)}s)`));
      allPassed = false;

      if (step.critical) {
        logger.error(chalk.red('\n⛔ Critical test failed. Stopping test suite.'));
        break;
      }
    }
  }

  // Summary
  logger.info(chalk.blue.bold('\n📊 Test Suite Summary\n'));

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const passedCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  // Results table
  results.forEach(result => {
    const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
    const time = `(${(result.duration / 1000).toFixed(2)}s)`;
    logger.info(`  ${status} ${result.step.padEnd(30)} ${time}`);
  });

  logger.info('');
  logger.info(`  Total Tests: ${results.length}`);
  logger.info(`  ${chalk.green(`Passed: ${passedCount}`)}`);
  if (failedCount > 0) {
    logger.info(`  ${chalk.red(`Failed: ${failedCount}`)}`);
  }
  logger.info(`  Total Time: ${(totalDuration / 1000).toFixed(2)}s`);

  if (allPassed) {
    logger.success(chalk.green.bold('\n🎉 All tests passed!'));
    process.exit(0);
  } else {
    logger.error(chalk.red.bold('\n💥 Some tests failed!'));
    process.exit(1);
  }
}

// Check for command line flags
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  logger.info(`Full Test Suite Runner

This script runs all quality checks and tests for the project:
- TypeScript type checking
- ESLint linting
- Prettier formatting check
- Unit tests (Jest)
- Integration tests (quick versions)

Usage:
  npm run test:full          Run all tests
  npm run test:full -- -h    Show this help

The script will stop on critical failures (type errors, lint errors, unit test failures).
Non-critical failures (formatting, integration tests) will be reported but won't stop execution.`);
  process.exit(0);
}

// Run the test suite
runFullTestSuite().catch(error => {
  logger.error('Unexpected error:', error);
  process.exit(1);
});
