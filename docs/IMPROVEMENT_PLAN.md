# Incremental Improvement Plan

This document outlines a structured plan for incrementally improving the Manic Miners Level Indexer, focusing exclusively on enhancing existing functionality.

## Executive Summary

The improvement plan prioritizes code quality, reliability, and performance enhancements without adding new features. The plan is organized into phases that can be implemented incrementally, with each phase building upon the previous improvements.

## Phase 1: Code Quality Baseline (1-2 weeks)

### 1.1 TypeScript Type Safety
**Priority**: High | **Effort**: Low | **Impact**: High

Fix all 27 ESLint warnings related to TypeScript types:

```typescript
// Before
const processData = (data: any) => {
  return data.items.map((item: any) => item.name);
}

// After
interface DataItem {
  name: string;
  // ... other properties
}

interface ProcessData {
  items: DataItem[];
}

const processData = (data: ProcessData): string[] => {
  return data.items.map(item => item.name);
}
```

**Files to update**:
- `scripts/index-discord-unified.ts`
- `scripts/test/test-discord-small.ts`
- `scripts/utils/validate-full-catalog.ts`
- `src/indexers/discordDirectAPI.ts`
- `src/tests/analysisReporter.ts`
- `src/tests/outputValidator.ts`
- `tests/integration/*.ts`

### 1.2 Remove Non-Null Assertions
**Priority**: High | **Effort**: Low | **Impact**: Medium

Replace non-null assertions with proper null checks:

```typescript
// Before
const value = someMap.get(key)!;

// After
const value = someMap.get(key);
if (!value) {
  throw new Error(`Missing value for key: ${key}`);
}
```

### 1.3 Configuration Validation Enhancement
**Priority**: Medium | **Effort**: Low | **Impact**: High

Strengthen configuration validation:

```typescript
// Add to src/config/configManager.ts
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  
  // Type validation
  if (!isIndexerConfig(config)) {
    errors.push('Invalid configuration structure');
  }
  
  // URL validation
  if (config.sources?.archive?.baseUrl) {
    try {
      new URL(config.sources.archive.baseUrl);
    } catch {
      errors.push('Invalid archive baseUrl');
    }
  }
  
  // Path validation
  if (!path.isAbsolute(config.outputDir)) {
    errors.push('outputDir must be an absolute path');
  }
  
  // Numeric range validation
  if (config.sources?.archive?.maxConcurrentDownloads) {
    const max = config.sources.archive.maxConcurrentDownloads;
    if (max < 1 || max > 20) {
      errors.push('maxConcurrentDownloads must be between 1 and 20');
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

## Phase 2: Test Coverage (2-3 weeks)

### 2.1 Unit Test Coverage
**Priority**: High | **Effort**: High | **Impact**: High

Create comprehensive test suites for untested modules:

#### Auth Module Tests
```typescript
// src/auth/discordAuth.test.ts
describe('DiscordAuth', () => {
  describe('token validation', () => {
    it('should validate correct token format');
    it('should reject invalid tokens');
    it('should handle network errors gracefully');
  });
  
  describe('caching', () => {
    it('should cache valid tokens');
    it('should invalidate expired tokens');
    it('should encrypt sensitive data');
  });
});
```

#### Indexer Tests
```typescript
// src/indexers/hognoseIndexer.test.ts
describe('HognoseIndexer', () => {
  it('should parse GitHub releases correctly');
  it('should handle missing assets gracefully');
  it('should extract levels from ZIP in memory');
  it('should detect format versions accurately');
});
```

### 2.2 Integration Test Enhancement
**Priority**: Medium | **Effort**: Medium | **Impact**: High

Add missing integration test scenarios:
- Error recovery testing
- Concurrent indexing tests
- Large dataset handling
- Network failure simulation

## Phase 3: Error Handling & Resilience (1-2 weeks)

### 3.1 Standardize Error Handling
**Priority**: High | **Effort**: Medium | **Impact**: High

Create custom error classes:

```typescript
// src/errors/index.ts
export class IndexerError extends Error {
  constructor(
    message: string,
    public code: string,
    public source?: MapSource,
    public details?: unknown
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

export class ValidationError extends IndexerError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', undefined, details);
  }
}

export class NetworkError extends IndexerError {
  constructor(message: string, source: MapSource, details?: unknown) {
    super(message, 'NETWORK_ERROR', source, details);
  }
}
```

### 3.2 Implement Retry Logic
**Priority**: Medium | **Effort**: Low | **Impact**: Medium

Add exponential backoff retry:

```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === options.maxRetries) {
        throw lastError;
      }
      
      options.onRetry?.(lastError, attempt);
      
      const delay = Math.min(
        options.initialDelay * Math.pow(2, attempt - 1),
        options.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

## Phase 4: Performance Optimization (2-3 weeks)

### 4.1 Memory Usage Optimization
**Priority**: Medium | **Effort**: High | **Impact**: High

#### Stream Processing for Large Files
```typescript
// src/utils/streamProcessor.ts
import { Transform } from 'stream';

export class LevelStreamProcessor extends Transform {
  private buffer = '';
  
  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.buffer += chunk.toString();
    
    // Process complete levels from buffer
    const levels = this.extractCompleteLevels();
    for (const level of levels) {
      this.push(level);
    }
    
    callback();
  }
  
  private extractCompleteLevels(): Level[] {
    // Implementation
  }
}
```

#### Implement LRU Cache
```typescript
// src/utils/lruCache.ts
export class LRUCache<K, V> {
  private maxSize: number;
  private cache = new Map<K, V>();
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

### 4.2 Batch Operations
**Priority**: Medium | **Effort**: Medium | **Impact**: Medium

Implement batching for file operations:

```typescript
// src/utils/batchProcessor.ts
export class BatchProcessor<T> {
  private batch: T[] = [];
  private timer?: NodeJS.Timeout;
  
  constructor(
    private processFn: (items: T[]) => Promise<void>,
    private options: {
      maxBatchSize: number;
      maxWaitTime: number;
    }
  ) {}
  
  async add(item: T): Promise<void> {
    this.batch.push(item);
    
    if (this.batch.length >= this.options.maxBatchSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.maxWaitTime);
    }
  }
  
  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    
    if (this.batch.length > 0) {
      const items = [...this.batch];
      this.batch = [];
      await this.processFn(items);
    }
  }
}
```

## Phase 5: Code Refactoring (1 week)

### 5.1 Extract Common Utilities
**Priority**: Medium | **Effort**: Low | **Impact**: Medium

Create shared utilities for common patterns:

```typescript
// src/utils/download.ts
export async function downloadWithProgress(
  url: string,
  options: DownloadOptions
): Promise<Buffer> {
  // Consolidated download logic
}

// src/utils/progress.ts
export class ProgressTracker {
  // Unified progress tracking
}

// src/utils/messageProcessor.ts
export class MessageProcessor {
  // Common Discord message processing
}
```

### 5.2 Improve Logging
**Priority**: Low | **Effort**: Low | **Impact**: Medium

Enhance logging with structured format:

```typescript
// src/utils/logger.ts
interface LogContext {
  correlationId?: string;
  source?: MapSource;
  operation?: string;
  [key: string]: unknown;
}

class Logger {
  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? JSON.stringify(context) : '';
    return `[${timestamp}] [${level}] ${message} ${contextStr}`.trim();
  }
  
  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('INFO', message, context));
  }
  
  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error?.message,
      stack: error?.stack
    };
    console.error(this.formatMessage('ERROR', message, errorContext));
  }
}
```

## Phase 6: Security & Resource Management (1 week)

### 6.1 Security Enhancements
**Priority**: Low | **Effort**: Medium | **Impact**: Medium

#### Encrypt Cached Tokens
```typescript
// src/auth/tokenEncryption.ts
import crypto from 'crypto';

export class TokenEncryptor {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(passphrase: string) {
    this.key = crypto.scryptSync(passphrase, 'salt', 32);
  }
  
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
  
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### 6.2 Resource Cleanup
**Priority**: Low | **Effort**: Low | **Impact**: Low

Ensure proper cleanup:

```typescript
// src/utils/resourceManager.ts
export class ResourceManager {
  private cleanupFns: (() => Promise<void>)[] = [];
  
  register(cleanup: () => Promise<void>): void {
    this.cleanupFns.push(cleanup);
  }
  
  async cleanup(): Promise<void> {
    const errors: Error[] = [];
    
    for (const fn of this.cleanupFns) {
      try {
        await fn();
      } catch (error) {
        errors.push(error as Error);
      }
    }
    
    this.cleanupFns = [];
    
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Cleanup failed');
    }
  }
}
```

## Implementation Timeline

### Month 1
- Week 1-2: Phase 1 (Code Quality)
- Week 3-4: Begin Phase 2 (Test Coverage)

### Month 2
- Week 1: Complete Phase 2
- Week 2-3: Phase 3 (Error Handling)
- Week 4: Phase 4 start (Performance)

### Month 3
- Week 1-2: Complete Phase 4
- Week 3: Phase 5 (Refactoring)
- Week 4: Phase 6 (Security)

## Success Metrics

1. **Code Quality**
   - Zero TypeScript/ESLint errors
   - 100% type coverage (no `any` types)

2. **Test Coverage**
   - >80% unit test coverage
   - All critical paths tested

3. **Reliability**
   - 50% reduction in uncaught errors
   - Graceful handling of all failure modes

4. **Performance**
   - 30% reduction in memory usage
   - 20% faster indexing for large datasets

5. **Maintainability**
   - Reduced code duplication by 40%
   - Clear separation of concerns

## Continuous Improvement

After completing all phases:
1. Regular code quality audits
2. Performance monitoring
3. Dependency updates
4. Security vulnerability scanning
5. User feedback incorporation

This plan ensures systematic improvement of the existing system without scope creep, making it more robust, efficient, and maintainable.