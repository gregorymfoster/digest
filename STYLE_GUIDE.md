# Digest Style Guide & Development Standards

## Code Style Guidelines

### Naming Conventions
- **Folders**: kebab-case (e.g., `src/analytics/`, `src/github-client/`)
- **Files**: snake_case (e.g., `metrics_engine.ts`, `github_client.ts`)
- **Variables/Functions**: camelCase (e.g., `computeMetrics`, `syncRepository`)
- **Types**: PascalCase (e.g., `DeveloperMetrics`, `PRRecord`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_TIMEFRAME`, `MAX_CONCURRENCY`)

### TypeScript Standards
- Use `type` declarations over `interface` declarations
- Target Node.js 20+ (ES2022, NodeNext modules)
- Use `.js` extensions in relative imports (ES module standard)
- All functions should have explicit return types
- Prefer explicit over implicit behavior

### Programming Paradigm
- **Functional programming preferred** over OOP
- **No classes or inheritance** - use pure functions and composition
- **No `this` keyword**
- **Composition over inheritance** - build complex behavior by combining simple functions
- **No global state** - pass execution context as parameters
- **Simple error handling** - try/catch instead of Result patterns for MVP
- **Minimal dependency injection** - only where needed for testing

### File Organization
- Each file should have a companion `.test.ts` file in the same directory (colocated tests)
- Keep functions pure when possible
- Use composition over inheritance
- Prefer explicit over implicit behavior

### Example File Structure
```
src/
├── analytics/
│   ├── metrics_engine.ts
│   ├── metrics_engine.test.ts
│   ├── quality_scoring.ts
│   └── quality_scoring.test.ts
├── github-client/
│   ├── github_sync.ts
│   ├── github_sync.test.ts
│   ├── rate_limiter.ts
│   └── rate_limiter.test.ts
```

## Technology Stack

### Core Tools
- **Language**: TypeScript with strict mode
- **Runtime**: Node.js 20+ (enforced via package.json engines)
- **Database**: SQLite with better-sqlite3
- **CLI Framework**: Commander.js
- **GitHub Integration**: gh CLI wrapper

### Development Tools  
- **Build**: tsup for efficient bundling
- **Development**: tsx for fast TypeScript execution
- **Testing**: vitest for fast testing with comprehensive coverage
- **Linting**: oxlint instead of ESLint (~100x faster, Rust-based)
- **Type Checking**: tsc --noEmit for TypeScript validation
- **Formatting**: prettier for consistent code style
- **Git Hooks**: husky for pre-commit quality gates

### Development Commands
```bash
npm run dev           # Run CLI locally with tsx
npm run dev:watch     # Development with auto-reload
npm run build         # Build with tsup
npm run test          # Unit tests with vitest
npm run test:watch    # Vitest in watch mode
npm run lint          # oxlint (fast Rust-based linting)
npm run typecheck     # TypeScript validation
npm run format        # Prettier code formatting
npm run ci            # Full pipeline: lint + typecheck + test + build
```

## Testing Strategy

### Test Organization
- Tests live next to source files (`file.ts` + `file.test.ts`)
- Use vitest for all testing
- Mock external dependencies using dependency injection
- Aim for high test coverage, especially for analytics algorithms

### Test Layers
1. **Unit Tests**: Pure functions and business logic
2. **Integration Tests**: Database operations with temp SQLite files
3. **Contract Tests**: GitHub CLI output parsing validation
4. **E2E Tests**: Full workflow with real repository data

### Test Patterns
```typescript
// Example unit test structure
import { describe, it, expect, vi } from 'vitest';
import { computeMetrics } from './metricsEngine.js';

describe('metricsEngine', () => {
  it('should compute basic developer metrics', () => {
    const mockPRs = [/* test data */];
    const result = computeMetrics(mockPRs);
    
    expect(result.totalPRs).toBe(5);
    expect(result.avgMergeTime).toBeCloseTo(2.5);
  });
});
```

## Architecture Patterns

### Functional Composition
```typescript
// Prefer function composition over classes
type ProcessingContext = {
  database: Database;
  config: DigestConfig;
};

// Pure functions with explicit dependencies
const syncPRData = async (context: ProcessingContext, repo: string) => {
  // Implementation
};

const computeMetrics = (prs: PRRecord[]) => {
  // Pure function - no side effects
};

// Compose functionality
const processRepository = async (context: ProcessingContext, repo: string) => {
  await syncPRData(context, repo);
  const prs = await loadPRs(context, repo);
  return computeMetrics(prs);
};
```

### Dependency Injection for Testing
```typescript
// Only inject dependencies that need mocking
type Dependencies = {
  execCommand?: (cmd: string) => Promise<string>;
  readFile?: (path: string) => string;
};

export const createGithubClient = (deps: Dependencies = {}) => {
  const { execCommand = execa, readFile = fs.readFileSync } = deps;
  
  return {
    fetchPRs: async (repo: string) => {
      const result = await execCommand(`gh pr list --repo ${repo}`);
      return JSON.parse(result);
    }
  };
};
```

## Configuration Management

### Default Configuration
```typescript
type DigestConfig = {
  concurrency?: number; // Default 10
  outputDir?: string; // Default './digest'
  cacheDir?: string; // Default '~/.digest-cache'
  // ... other config options
};

// Zod validation with helpful error messages
const DigestConfigSchema = z.object({
  concurrency: z.number().min(1).max(50).default(10),
  outputDir: z.string().default('./digest'),
  // ...
});
```

## Quality Gates

### Pre-commit Requirements
All commits must pass:
- `npm run lint` (oxlint validation)
- `npm run typecheck` (TypeScript compilation)
- `npm run test` (unit test suite)

### CI Pipeline
```bash
npm run ci  # Runs: lint + typecheck + test + build
```

This ensures main branch always stays green and deployable.

## Performance Considerations

- **oxlint**: ~100x faster than ESLint for linting
- **vitest**: Fast test execution with native ESM support
- **tsx**: Fast TypeScript execution for development
- **SQLite**: Efficient local database with no setup required
- **Bounded concurrency**: Use p-limit for GitHub API rate limiting

This style guide should be referenced by all other documentation files to avoid duplication.