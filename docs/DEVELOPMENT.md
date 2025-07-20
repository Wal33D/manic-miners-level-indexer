# Development Guide

This guide covers development setup, coding standards, testing, and contributing to the Manic Miners Level Indexer.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Coding Standards](#coding-standards)
4. [Testing](#testing)
5. [Adding New Features](#adding-new-features)
6. [Creating a New Indexer](#creating-a-new-indexer)
7. [Debugging](#debugging)
8. [Performance Optimization](#performance-optimization)
9. [Contributing](#contributing)
10. [Release Process](#release-process)

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- Git
- Visual Studio Code (recommended) or preferred IDE
- GitHub account (for contributing)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-username/manic-miners-level-indexer.git
cd manic-miners-level-indexer

# Install dependencies
npm install

# Set up pre-commit hooks
npm run setup:hooks

# Create development config
cp config.template.json config.development.json

# Set up environment variables
cp .env.example .env
```

### IDE Configuration

#### Visual Studio Code

Recommended extensions:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-tsd",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

Settings (.vscode/settings.json):
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Development Workflow

```bash
# Start development mode
npm run dev

# Watch for changes
npm run dev:watch

# Run type checking in watch mode
npm run type-check:watch

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
manic-miners-level-indexer/
├── src/                      # Source code
│   ├── index.ts             # Main entry point
│   ├── types/               # TypeScript type definitions
│   ├── auth/                # Authentication modules
│   ├── catalog/             # Catalog management
│   ├── indexers/            # Source-specific indexers
│   ├── utils/               # Utility functions
│   └── tests/               # Test utilities
├── scripts/                  # Standalone scripts
│   ├── index-*.ts           # Indexing scripts
│   ├── test/                # Test scripts
│   └── utils/               # Utility scripts
├── tests/                    # Integration tests
│   ├── integration/         # Integration test suites
│   └── fixtures/            # Test data
├── docs/                     # Documentation
├── dist/                     # Compiled JavaScript (generated)
├── output/                   # Default output directory
└── config files...           # Configuration files
```

### Key Directories

- **src/indexers/**: Implement new data sources here
- **src/types/**: Add new interfaces and types
- **src/utils/**: Shared utility functions
- **tests/**: Add corresponding tests for new features

## Coding Standards

### TypeScript Guidelines

```typescript
// Use explicit types for function parameters and returns
function processLevel(level: Level): ProcessedLevel {
  // Implementation
}

// Use interfaces for object shapes
interface IndexerOptions {
  outputDir: string;
}

// Use enums for fixed sets of values
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// Prefer const assertions for literals
const sources = ['archive', 'discord', 'hognose'] as const;
type Source = typeof sources[number];
```

### Naming Conventions

```typescript
// Classes: PascalCase
class LevelProcessor { }

// Interfaces: PascalCase with 'I' prefix optional
interface LevelMetadata { }

// Functions/Methods: camelCase
function parseLevel() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// File names: kebab-case
// level-processor.ts
```

### Error Handling

```typescript
// Always use custom error classes
class IndexerError extends Error {
  constructor(
    message: string,
    public code: string,
    public source?: MapSource
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

// Handle errors gracefully
try {
  await indexer.index();
} catch (error) {
  if (error instanceof IndexerError) {
    logger.error(`Indexer error [${error.code}]: ${error.message}`);
  } else {
    logger.error('Unexpected error:', error);
  }
}
```

### Async/Await Best Practices

```typescript
// Always use async/await over promises
async function fetchLevels(): Promise<Level[]> {
  const response = await fetch(url);
  return response.json();
}

// Handle concurrent operations
async function processMultiple(items: Item[]): Promise<Result[]> {
  return Promise.all(items.map(item => processItem(item)));
}

// Use p-limit for concurrency control
import pLimit from 'p-limit';
const limit = pLimit(5);

const results = await Promise.all(
  items.map(item => limit(() => processItem(item)))
);
```

## Testing

### Test Structure

```typescript
// tests/unit/catalog-manager.test.ts
import { CatalogManager } from '../../src/catalog/catalogManager';

describe('CatalogManager', () => {
  let manager: CatalogManager;

  beforeEach(() => {
    manager = new CatalogManager('./test-output');
  });

  afterEach(async () => {
    await fs.remove('./test-output');
  });

  describe('addLevel', () => {
    it('should add a level to the catalog', async () => {
      const level = createMockLevel();
      await manager.addLevel(level);
      
      const retrieved = await manager.getLevel(level.metadata.id, level.metadata.source);
      expect(retrieved).toEqual(level);
    });
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test catalog-manager.test.ts

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Writing Tests

```typescript
// Use descriptive test names
it('should handle network errors gracefully', async () => {
  // Mock network failure
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
  
  // Test error handling
  await expect(indexer.fetchData()).rejects.toThrow('Network error');
});

// Test edge cases
it('should handle empty responses', async () => {
  const result = await processor.process([]);
  expect(result).toEqual([]);
});

// Use test fixtures
import { loadFixture } from '../helpers';

it('should parse complex level data', async () => {
  const levelData = await loadFixture('complex-level.dat');
  const parsed = parser.parse(levelData);
  expect(parsed.metadata.title).toBe('Complex Level');
});
```

## Adding New Features

### 1. Plan the Feature

```markdown
## Feature: Add Steam Workshop Support

### Requirements
- [ ] Fetch levels from Steam Workshop
- [ ] Parse Steam metadata
- [ ] Handle Steam authentication
- [ ] Add configuration options

### Implementation Plan
1. Create SteamIndexer class
2. Add Steam types to types/index.ts
3. Implement authentication flow
4. Add tests
5. Update documentation
```

### 2. Create Feature Branch

```bash
git checkout -b feature/steam-workshop-support
```

### 3. Implement the Feature

```typescript
// src/indexers/steamIndexer.ts
import { BaseIndexer } from './baseIndexer';

export class SteamIndexer extends BaseIndexer {
  async index(): Promise<Level[]> {
    // Implementation
  }
}
```

### 4. Add Tests

```typescript
// tests/unit/steam-indexer.test.ts
describe('SteamIndexer', () => {
  // Test cases
});
```

### 5. Update Documentation

- Add to API reference
- Update configuration guide
- Add usage examples

## Creating a New Indexer

### Step 1: Define the Indexer Interface

```typescript
// src/indexers/mySourceIndexer.ts
import { Level, IndexerProgress } from '../types';

export interface MySourceConfig {
  apiKey?: string;
  baseUrl: string;
  maxResults?: number;
}

export class MySourceIndexer {
  constructor(
    private config: MySourceConfig,
    private outputDir: string
  ) {}

  async index(): Promise<Level[]> {
    // Implementation
  }
}
```

### Step 2: Implement Core Methods

```typescript
class MySourceIndexer {
  private async fetchLevelList(): Promise<RawLevel[]> {
    // Fetch from API
  }

  private async downloadLevel(rawLevel: RawLevel): Promise<Level> {
    // Download and process
  }

  private async saveLevel(level: Level): Promise<void> {
    // Save to file system
  }

  async index(): Promise<Level[]> {
    const rawLevels = await this.fetchLevelList();
    const levels: Level[] = [];

    for (const rawLevel of rawLevels) {
      try {
        const level = await this.downloadLevel(rawLevel);
        await this.saveLevel(level);
        levels.push(level);
      } catch (error) {
        logger.error(`Failed to process level: ${error}`);
      }
    }

    return levels;
  }
}
```

### Step 3: Add Progress Tracking

```typescript
class MySourceIndexer {
  private progressCallback?: (progress: IndexerProgress) => void;

  setProgressCallback(callback: (progress: IndexerProgress) => void): void {
    this.progressCallback = callback;
  }

  private reportProgress(current: number, total: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback({
        phase: 'indexing',
        source: MapSource.MYSOURCE,
        current,
        total,
        message
      });
    }
  }
}
```

### Step 4: Integrate with MasterIndexer

```typescript
// src/catalog/masterIndexer.ts
import { MySourceIndexer } from '../indexers/mySourceIndexer';

class MasterIndexer {
  async indexMySource(): Promise<void> {
    if (!this.config.sources.mysource?.enabled) return;

    const indexer = new MySourceIndexer(
      this.config.sources.mysource,
      this.outputDir
    );

    await indexer.index();
  }
}
```

## Debugging

### Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Indexer",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "tsc: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "DEBUG": "*",
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Debug Logging

```typescript
import debug from 'debug';

const log = debug('indexer:mysource');

class MySourceIndexer {
  async index(): Promise<Level[]> {
    log('Starting indexing with config:', this.config);
    
    // Use throughout the code
    log('Fetching level list...');
    const levels = await this.fetchLevelList();
    log(`Found ${levels.length} levels`);
  }
}
```

### Memory Profiling

```bash
# Generate heap snapshot
node --inspect dist/index.js

# Open chrome://inspect in Chrome
# Take heap snapshot
# Analyze memory usage
```

## Performance Optimization

### Profiling Tools

```bash
# CPU profiling
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt

# Clinic.js for performance analysis
npm install -g clinic
clinic doctor -- node dist/index.js
```

### Optimization Techniques

```typescript
// 1. Use streaming for large data
import { Transform } from 'stream';

class LevelProcessor extends Transform {
  _transform(chunk: any, encoding: string, callback: Function): void {
    // Process chunk
    callback(null, processedChunk);
  }
}

// 2. Implement caching
class CachedFetcher {
  private cache = new Map<string, any>();

  async fetch(url: string): Promise<any> {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    
    const data = await fetch(url).then(r => r.json());
    this.cache.set(url, data);
    return data;
  }
}

// 3. Use worker threads for CPU-intensive tasks
import { Worker } from 'worker_threads';

async function processInWorker(data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./processor-worker.js');
    worker.postMessage(data);
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

## Contributing

### Before Contributing

1. Check existing issues and PRs
2. Discuss major changes in an issue first
3. Follow the code style guide
4. Write tests for new features
5. Update documentation

### Pull Request Process

1. **Fork and Clone**
```bash
git clone https://github.com/your-username/manic-miners-level-indexer.git
cd manic-miners-level-indexer
git remote add upstream https://github.com/original/manic-miners-level-indexer.git
```

2. **Create Feature Branch**
```bash
git checkout -b feature/your-feature-name
```

3. **Make Changes**
```bash
# Make your changes
npm run lint
npm run type-check
npm test
```

4. **Commit Changes**
```bash
git add .
git commit -m "feat: add new feature

- Detailed description
- Closes #123"
```

5. **Push and Create PR**
```bash
git push origin feature/your-feature-name
# Create PR on GitHub
```

### Commit Message Format

Follow conventional commits:
```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

Example:
```
feat(discord): add support for voice channels

- Implement voice channel detection
- Add transcription support
- Update tests

Closes #456
```

## Release Process

### Version Bumping

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.0 -> 1.1.0)
npm version minor

# Major release (1.0.0 -> 2.0.0)
npm version major
```

### Release Checklist

1. **Update Documentation**
   - Update CHANGELOG.md
   - Update version in README.md
   - Review all docs for accuracy

2. **Run Full Test Suite**
```bash
npm run lint
npm run type-check
npm run test
npm run test:integration
```

3. **Build and Verify**
```bash
npm run clean
npm run build
npm run verify:build
```

4. **Create Release**
```bash
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

5. **Publish to npm** (if applicable)
```bash
npm publish
```

### Post-Release

1. Create GitHub release with notes
2. Update project board
3. Announce in community channels
4. Monitor for issues

## Resources

### Useful Links

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [ESLint Rules](https://eslint.org/docs/rules/)

### Community

- [Discord Server](https://discord.gg/manic-miners)
- [GitHub Discussions](https://github.com/your-username/manic-miners-level-indexer/discussions)
- [Issue Tracker](https://github.com/your-username/manic-miners-level-indexer/issues)