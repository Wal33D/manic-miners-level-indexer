# Level Profiler Design Document

This document outlines the design and integration plan for the Level Profiler feature, which will analyze and deconstruct Manic Miners levels to provide comprehensive gameplay insights and difficulty metrics.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Analysis Modules](#analysis-modules)
4. [Integration Strategy](#integration-strategy)
5. [Data Models](#data-models)
6. [Profiling Pipeline](#profiling-pipeline)
7. [Metrics and Scoring](#metrics-and-scoring)
8. [API Design](#api-design)
9. [Performance Optimization](#performance-optimization)
10. [Implementation Roadmap](#implementation-roadmap)

## Overview

The Level Profiler will use the user's specialized package to deconstruct and parse Manic Miners maps, providing:
- **Difficulty Analysis**: Objective complexity scoring
- **Resource Counting**: Complete inventory of tiles, objects, and requirements
- **Path Analysis**: Route complexity and navigation challenges
- **Balance Metrics**: Resource availability vs. objectives
- **Gameplay Predictions**: Estimated completion time and strategy hints

### Goals

1. **Objective Analysis**: Quantify level difficulty and complexity
2. **Player Guidance**: Help players choose appropriate challenges
3. **Creator Insights**: Provide feedback for level designers
4. **Catalog Enhancement**: Enable advanced filtering and recommendations

## Architecture Design

### Module Structure

```
src/
├── profiler/
│   ├── index.ts                  # Main profiler module
│   ├── levelParser.ts            # Integration with user's parser package
│   ├── analyzers/
│   │   ├── difficultyAnalyzer.ts # Difficulty calculation
│   │   ├── resourceAnalyzer.ts   # Resource counting
│   │   ├── pathAnalyzer.ts       # Path finding and analysis
│   │   ├── objectiveAnalyzer.ts  # Objective complexity
│   │   └── balanceAnalyzer.ts    # Game balance metrics
│   ├── scoring/
│   │   ├── difficultyScorer.ts   # Difficulty scoring algorithm
│   │   ├── complexityScorer.ts   # Complexity calculations
│   │   └── scoreAggregator.ts    # Combine all scores
│   ├── types.ts                  # Profiler-specific types
│   └── config.ts                 # Configuration options
```

### Component Architecture

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Level Parser    │────▶│    Analyzers    │────▶│ Score Aggregator │
│  (User Package)  │     │                 │     │                  │
└──────────────────┘     └─────────────────┘     └──────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
   Parse DAT File          Analyze Components      Generate Profile
   Extract Data            Calculate Metrics       Create Report
   Build Model             Score Difficulty        Update Catalog
```

## Analysis Modules

### 1. Difficulty Analyzer

```typescript
export class DifficultyAnalyzer {
  analyze(levelData: ParsedLevel): DifficultyMetrics {
    return {
      // Map size complexity
      sizeComplexity: this.calculateSizeComplexity(levelData),
      
      // Resource scarcity
      resourceScarcity: this.calculateResourceScarcity(levelData),
      
      // Navigation challenge
      navigationDifficulty: this.calculateNavigationDifficulty(levelData),
      
      // Time pressure
      timePressure: this.calculateTimePressure(levelData),
      
      // Overall difficulty score (1-10)
      overallScore: this.calculateOverallScore(levelData)
    };
  }
}
```

### 2. Resource Analyzer

```typescript
export class ResourceAnalyzer {
  analyze(levelData: ParsedLevel): ResourceMetrics {
    return {
      // Tile counts by type
      tiles: {
        solidRock: this.countTileType(levelData, TileType.SOLID_ROCK),
        looseRock: this.countTileType(levelData, TileType.LOOSE_ROCK),
        dirt: this.countTileType(levelData, TileType.DIRT),
        crystals: this.countTileType(levelData, TileType.CRYSTAL),
        ore: this.countTileType(levelData, TileType.ORE),
        // ... more tile types
      },
      
      // Object counts
      objects: {
        toolStores: this.countObjectType(levelData, ObjectType.TOOL_STORE),
        teleports: this.countObjectType(levelData, ObjectType.TELEPORT),
        vehicles: this.countObjectType(levelData, ObjectType.VEHICLE),
        buildings: this.countObjectType(levelData, ObjectType.BUILDING),
        // ... more object types
      },
      
      // Resource ratios
      ratios: {
        crystalsPerMiner: this.calculateCrystalRatio(levelData),
        orePerObjective: this.calculateOreRatio(levelData),
        toolStoresPerArea: this.calculateToolStoreDensity(levelData)
      }
    };
  }
}
```

### 3. Path Analyzer

```typescript
export class PathAnalyzer {
  analyze(levelData: ParsedLevel): PathMetrics {
    const pathfinding = new Pathfinding(levelData);
    
    return {
      // Critical paths
      criticalPaths: pathfinding.findCriticalPaths(),
      
      // Path complexity
      complexity: {
        averagePathLength: pathfinding.calculateAverageLength(),
        pathBranching: pathfinding.calculateBranchingFactor(),
        bottlenecks: pathfinding.findBottlenecks(),
        deadEnds: pathfinding.findDeadEnds()
      },
      
      // Accessibility
      accessibility: {
        unreachableAreas: pathfinding.findUnreachableAreas(),
        requiredTools: pathfinding.calculateRequiredTools(),
        minimumMiners: pathfinding.calculateMinimumMiners()
      }
    };
  }
}
```

### 4. Objective Analyzer

```typescript
export class ObjectiveAnalyzer {
  analyze(levelData: ParsedLevel): ObjectiveMetrics {
    return {
      // Objective types
      objectives: this.parseObjectives(levelData),
      
      // Complexity scoring
      complexity: {
        objectiveCount: levelData.objectives.length,
        uniqueTypes: this.countUniqueObjectiveTypes(levelData),
        dependencies: this.analyzeDependencies(levelData),
        estimatedTime: this.estimateCompletionTime(levelData)
      },
      
      // Strategy hints
      strategies: this.generateStrategyHints(levelData)
    };
  }
}
```

## Integration Strategy

### 1. User Package Integration

```typescript
// src/profiler/levelParser.ts
import { LevelParser as UserLevelParser } from '@user/manic-miners-parser';

export class LevelParserAdapter {
  private parser: UserLevelParser;
  
  constructor() {
    this.parser = new UserLevelParser();
  }
  
  async parse(datPath: string): Promise<ParsedLevel> {
    // Use user's package to parse the level
    const rawData = await this.parser.parse(datPath);
    
    // Adapt to our internal format if needed
    return this.adaptToInternalFormat(rawData);
  }
}
```

### 2. Indexer Integration

```typescript
// src/indexers/base/baseIndexer.ts
export abstract class BaseIndexer {
  protected async processLevel(level: Level): Promise<void> {
    // Existing processing...
    
    // New: Profile level if profiler enabled
    if (this.config.enableProfiler) {
      const profiler = new LevelProfiler(this.config.profiler);
      const profile = await profiler.profile(level.datFilePath);
      
      // Add profile data to metadata
      level.metadata.profile = profile;
      level.metadata.difficulty = profile.difficulty.overallScore;
      level.metadata.estimatedPlayTime = profile.objectives.estimatedTime;
    }
  }
}
```

## Data Models

### Profile Data Structure

```typescript
export interface LevelProfile {
  // Analysis timestamp
  analyzedAt: Date;
  
  // Difficulty metrics
  difficulty: DifficultyMetrics;
  
  // Resource analysis
  resources: ResourceMetrics;
  
  // Path analysis
  paths: PathMetrics;
  
  // Objective analysis
  objectives: ObjectiveMetrics;
  
  // Balance metrics
  balance: BalanceMetrics;
  
  // Aggregated scores
  scores: {
    difficulty: number;      // 1-10 scale
    complexity: number;      // 1-10 scale
    balance: number;         // 1-10 scale
    accessibility: number;   // 1-10 scale
    overall: number;         // Weighted average
  };
  
  // Recommendations
  recommendations: {
    playerLevel: 'beginner' | 'intermediate' | 'expert';
    estimatedPlayTime: number; // minutes
    suggestedStrategy: string[];
    warnings: string[];        // e.g., "Very limited resources"
  };
}
```

### Detailed Metrics

```typescript
export interface DifficultyMetrics {
  sizeComplexity: number;
  resourceScarcity: number;
  navigationDifficulty: number;
  timePressure: number;
  overallScore: number;
  factors: {
    mapSize: 'small' | 'medium' | 'large' | 'huge';
    resourceAvailability: 'abundant' | 'adequate' | 'scarce' | 'minimal';
    routeComplexity: 'linear' | 'branching' | 'maze-like' | 'labyrinth';
  };
}

export interface ResourceMetrics {
  tiles: Record<TileType, number>;
  objects: Record<ObjectType, number>;
  ratios: {
    crystalsPerMiner: number;
    orePerObjective: number;
    toolStoresPerArea: number;
  };
  totals: {
    totalTiles: number;
    totalObjects: number;
    totalResources: number;
  };
}
```

## Profiling Pipeline

### 1. Level Loading

```typescript
export class ProfilePipeline {
  async profile(datPath: string): Promise<LevelProfile> {
    // Step 1: Parse level data
    const levelData = await this.parser.parse(datPath);
    
    // Step 2: Run analyzers in parallel
    const [difficulty, resources, paths, objectives] = await Promise.all([
      this.difficultyAnalyzer.analyze(levelData),
      this.resourceAnalyzer.analyze(levelData),
      this.pathAnalyzer.analyze(levelData),
      this.objectiveAnalyzer.analyze(levelData)
    ]);
    
    // Step 3: Calculate balance metrics
    const balance = await this.balanceAnalyzer.analyze({
      levelData,
      difficulty,
      resources,
      paths,
      objectives
    });
    
    // Step 4: Aggregate scores
    const scores = this.scoreAggregator.aggregate({
      difficulty,
      resources,
      paths,
      objectives,
      balance
    });
    
    // Step 5: Generate recommendations
    const recommendations = this.recommendationEngine.generate({
      scores,
      metrics: { difficulty, resources, paths, objectives, balance }
    });
    
    return {
      analyzedAt: new Date(),
      difficulty,
      resources,
      paths,
      objectives,
      balance,
      scores,
      recommendations
    };
  }
}
```

### 2. Caching Strategy

```typescript
export class ProfileCache {
  private cache = new Map<string, LevelProfile>();
  private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  async getProfile(datPath: string, fileHash: string): Promise<LevelProfile | null> {
    const cacheKey = `${datPath}:${fileHash}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValid(cached)) {
      return cached;
    }
    
    return null;
  }
  
  private isValid(profile: LevelProfile): boolean {
    const age = Date.now() - profile.analyzedAt.getTime();
    return age < this.maxAge;
  }
}
```

## Metrics and Scoring

### 1. Difficulty Scoring Algorithm

```typescript
export class DifficultyScorer {
  calculateScore(metrics: AllMetrics): number {
    const weights = {
      mapSize: 0.15,
      resourceScarcity: 0.25,
      navigationComplexity: 0.20,
      objectiveComplexity: 0.25,
      timePressure: 0.15
    };
    
    const scores = {
      mapSize: this.scoreMapSize(metrics.resources),
      resourceScarcity: this.scoreResourceScarcity(metrics.resources),
      navigationComplexity: this.scoreNavigation(metrics.paths),
      objectiveComplexity: this.scoreObjectives(metrics.objectives),
      timePressure: this.scoreTimePressure(metrics.objectives)
    };
    
    // Weighted average
    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
      totalScore += scores[key] * weight;
    }
    
    // Apply modifiers
    totalScore = this.applyModifiers(totalScore, metrics);
    
    // Ensure 1-10 range
    return Math.max(1, Math.min(10, Math.round(totalScore)));
  }
}
```

### 2. Complexity Analysis

```typescript
export class ComplexityScorer {
  calculateComplexity(metrics: AllMetrics): ComplexityScore {
    return {
      // Spatial complexity
      spatial: this.calculateSpatialComplexity(metrics.paths),
      
      // Resource management complexity
      resourceManagement: this.calculateResourceComplexity(metrics.resources),
      
      // Strategic complexity
      strategic: this.calculateStrategicComplexity(metrics.objectives),
      
      // Overall complexity
      overall: this.calculateOverallComplexity(metrics)
    };
  }
}
```

## API Design

### Public API

```typescript
export class LevelProfiler {
  constructor(config: ProfilerConfig);
  
  // Profile single level
  async profile(datPath: string): Promise<LevelProfile>;
  
  // Batch profiling
  async profileBatch(datPaths: string[]): Promise<LevelProfile[]>;
  
  // Quick analysis (partial profile)
  async quickAnalysis(datPath: string): Promise<QuickProfile>;
  
  // Update existing profile
  async updateProfile(datPath: string, existingProfile: LevelProfile): Promise<LevelProfile>;
  
  // Export profile report
  async exportReport(profile: LevelProfile, format: 'json' | 'html' | 'pdf'): Promise<string>;
}
```

### Configuration

```typescript
export interface ProfilerConfig {
  enabled: boolean;
  
  // Analysis options
  analysis: {
    enableDifficulty: boolean;
    enableResources: boolean;
    enablePaths: boolean;
    enableObjectives: boolean;
    enableBalance: boolean;
  };
  
  // Performance options
  performance: {
    concurrent: number;        // Parallel analysis
    cacheProfiles: boolean;
    cacheExpiry: number;      // Cache lifetime in ms
    quickMode: boolean;       // Faster but less accurate
  };
  
  // Scoring weights
  scoring: {
    difficultyWeights?: DifficultyWeights;
    complexityWeights?: ComplexityWeights;
    customScorers?: CustomScorer[];
  };
}
```

### Usage Example

```typescript
import { LevelProfiler } from './profiler';

const profiler = new LevelProfiler({
  enabled: true,
  analysis: {
    enableDifficulty: true,
    enableResources: true,
    enablePaths: true,
    enableObjectives: true,
    enableBalance: true
  },
  performance: {
    concurrent: 4,
    cacheProfiles: true,
    cacheExpiry: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});

// Profile single level
const profile = await profiler.profile('./level.dat');
console.log(`Difficulty: ${profile.scores.difficulty}/10`);
console.log(`Recommended for: ${profile.recommendations.playerLevel}`);
console.log(`Estimated play time: ${profile.recommendations.estimatedPlayTime} minutes`);

// Export report
const reportPath = await profiler.exportReport(profile, 'html');
console.log(`Report saved to: ${reportPath}`);
```

## Performance Optimization

### 1. Parallel Analysis

```typescript
export class ParallelAnalyzer {
  async analyzeInParallel(
    levelData: ParsedLevel,
    analyzers: Analyzer[]
  ): Promise<AnalysisResult[]> {
    // Use worker threads for CPU-intensive analysis
    const workers = new WorkerPool({
      workerScript: './profiler-worker.js',
      maxWorkers: os.cpus().length
    });
    
    const tasks = analyzers.map(analyzer => ({
      analyzer: analyzer.name,
      data: levelData
    }));
    
    return workers.processTasks(tasks);
  }
}
```

### 2. Incremental Analysis

```typescript
export class IncrementalProfiler {
  async updateProfile(
    datPath: string,
    existingProfile: LevelProfile,
    changes: LevelChanges
  ): Promise<LevelProfile> {
    // Only re-analyze affected components
    const updatedComponents = this.determineAffectedComponents(changes);
    
    const updates = await Promise.all(
      updatedComponents.map(component => 
        this.analyzers[component].analyze(datPath)
      )
    );
    
    // Merge with existing profile
    return this.mergeProfiles(existingProfile, updates);
  }
}
```

### 3. Quick Analysis Mode

```typescript
export class QuickAnalyzer {
  async quickAnalysis(levelData: ParsedLevel): Promise<QuickProfile> {
    // Use sampling and approximations for speed
    return {
      approximateDifficulty: this.estimateDifficulty(levelData),
      resourceSummary: this.quickResourceCount(levelData),
      estimatedComplexity: this.estimateComplexity(levelData),
      confidence: 0.85 // 85% confidence in quick analysis
    };
  }
}
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **Set up profiler module**
   - Create directory structure
   - Define TypeScript interfaces
   - Integrate user's parser package

2. **Implement basic analyzers**
   - Resource counting
   - Basic difficulty calculation
   - Simple objective parsing

3. **Create profile data model**
   - Define profile schema
   - Implement storage format
   - Add to catalog metadata

### Phase 2: Core Analysis (Week 3-4)
1. **Advanced analyzers**
   - Path finding algorithm
   - Balance calculations
   - Complexity scoring

2. **Scoring system**
   - Implement scoring algorithms
   - Weight calibration
   - Score aggregation

3. **Integration with indexers**
   - Hook into processing pipeline
   - Update catalog with profiles
   - Cache implementation

### Phase 3: Enhanced Features (Week 5-6)
1. **Performance optimization**
   - Parallel analysis
   - Worker thread implementation
   - Memory optimization

2. **Recommendation engine**
   - Player level suggestions
   - Strategy generation
   - Warning system

3. **Report generation**
   - HTML report templates
   - PDF export
   - Visual analytics

### Phase 4: Polish and Testing (Week 7-8)
1. **Testing suite**
   - Unit tests for analyzers
   - Integration tests
   - Performance benchmarks

2. **Calibration**
   - Score tuning
   - User feedback integration
   - Balance adjustments

3. **Documentation**
   - API documentation
   - Usage guides
   - Algorithm explanations

## Future Enhancements

### Planned Features
1. **Machine Learning**: ML-based difficulty prediction
2. **Player Modeling**: Personalized difficulty ratings
3. **Design Assistant**: Suggestions for level creators
4. **Comparative Analysis**: Compare similar levels
5. **Trend Analysis**: Track difficulty trends over time

### Integration Opportunities
1. **Web Dashboard**: Visual profile explorer
2. **Discord Bot**: Level recommendations
3. **Creator Tools**: Real-time analysis while designing
4. **Tournament System**: Difficulty-based matchmaking

## Technical Challenges

### 1. Parser Compatibility
- Ensure compatibility with user's package
- Handle parser updates gracefully
- Support multiple parser versions

### 2. Scoring Calibration
- Balance between different metrics
- Account for subjective difficulty
- Handle edge cases and outliers

### 3. Performance at Scale
- Efficient analysis of thousands of levels
- Memory management for large maps
- Cache invalidation strategies

## Success Metrics

1. **Accuracy**
   - Difficulty predictions match player feedback > 85%
   - Resource counts 100% accurate
   - Path analysis finds all valid routes

2. **Performance**
   - Analysis time < 1 second per level
   - Memory usage < 200MB per analysis
   - Batch processing > 5 levels/second

3. **Utility**
   - Players use recommendations
   - Creators value feedback
   - Improved level discovery

## Conclusion

The Level Profiler will transform the Manic Miners Level Indexer into a comprehensive analysis platform, providing valuable insights for both players and creators. By leveraging the user's specialized parsing package, we can deliver accurate, detailed profiles that enhance the entire ecosystem.