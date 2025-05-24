# Claude Guidelines for digest

## Project Overview
digest is a TypeScript CLI tool that provides management insights for software development teams by analyzing GitHub PR data. It:
1. Syncs PR data from multiple repositories or entire organizations
2. Computes analytics metrics for developers, teams, and codebase areas
3. Generates quality scores and collaboration insights
4. Provides management dashboards and reports via CLI interface
5. Stores analytics in optimized SQLite database for fast querying

## Architecture Guidelines
- Follow the architecture in `DESIGN.md` precisely
- Focus on management insights and actionable analytics
- Design for scalability across large organizations
- Prioritize data privacy and configurable retention

## Code Style Rules
**See `STYLE_GUIDE.md` for complete development standards including:**
- Naming conventions (kebab-case folders, snake_case files)
- TypeScript standards and functional programming approach
- Technology stack (tsup, vitest, oxlint)
- Testing strategy with colocated tests
- Architecture patterns and dependency injection

## Project Structure
```
src/
├── cli/                # CLI entry point & management commands
│   ├── index.ts        # Main CLI entry
│   ├── commands/       # Individual command implementations
│   └── cli.test.ts
├── core/               # Core business logic
│   ├── analytics/      # Metrics computation engine
│   ├── database/       # Data models and queries
│   ├── github/         # GitHub integration with multi-repo support
│   └── insights/       # Report generation and dashboards
├── types/              # TypeScript type definitions
│   ├── config.ts       # DigestConfig and validation types
│   ├── github.ts       # GitHub API and multi-repo types
│   ├── analytics.ts    # Metrics, quality scores, insights types
│   ├── database.ts     # Database schema and record types
│   └── index.ts        # Re-exports
└── adapters/           # External integrations (future)
```

## Development Workflow
**See `STYLE_GUIDE.md` for complete development commands and tooling setup.**

Key commands for digest development:
```bash
npm run dev sync owner/repo        # Test sync functionality
npm run dev contributors           # Test analytics output
npm run test                      # Run unit tests
npm run ci                        # Full quality pipeline
```

## Key Coding Patterns

### Analytics Pipeline Architecture
```typescript
// Analytics computation pipeline
type AnalyticsStage<TInput, TOutput> = (
  context: ProcessingContext,
  input: TInput
) => Promise<TOutput>;

// Main analytics pipeline
const computeInsights = pipe(
  syncPRData,
  computeDeveloperMetrics,
  computeTeamMetrics,
  computeAreaMetrics,
  generateReports
);
```

### Quality Scoring System
```typescript
type QualityScore = {
  overall: number; // 0-100
  breakdown: {
    testCoverage: number;
    documentation: number;
    reviewThoroughness: number;
    reworkRate: number; // inverted - lower is better
  };
};

const computeQualityScore = (pr: PRRecord, weights: QualityWeights): QualityScore => {
  // Multi-factor scoring algorithm
  const scores = {
    testCoverage: pr.has_tests ? 100 : 0,
    documentation: pr.has_docs ? 100 : 0,
    reviewThoroughness: computeReviewScore(pr.reviews),
    reworkRate: Math.max(0, 100 - pr.review_cycles * 20)
  };
  
  const overall = Object.entries(scores)
    .reduce((sum, [key, score]) => sum + score * weights[key], 0)
    / Object.values(weights).reduce((a, b) => a + b);
    
  return { overall, breakdown: scores };
};
```

### GitHub Integration with Octokit
```typescript
// Initialize Octokit with authentication hierarchy
const createGitHubClient = async (config?: DigestConfig) => {
  const auth = await getGitHubToken(config);
  
  return new Octokit({
    auth,
    throttle: {
      onRateLimit: (retryAfter, options) => {
        console.warn(`Rate limit exceeded, retrying after ${retryAfter}s`);
        return true; // Retry automatically
      },
      onSecondaryRateLimit: (retryAfter, options) => {
        console.warn(`Secondary rate limit, retrying after ${retryAfter}s`);
        return true;
      }
    }
  });
};

// Fetch PR data with proper typing
const fetchPRData = async (octokit: Octokit, owner: string, repo: string, prNumber: number) => {
  const [prDetails, reviews, files] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber })
  ]);
  
  return { pr: prDetails.data, reviews: reviews.data, files: files.data };
};

// Authentication token hierarchy
const getGitHubToken = async (config?: DigestConfig): Promise<string> => {
  // 1. Environment variable (highest priority)
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  
  // 2. Config file token
  if (config?.github?.token) return config.github.token;
  
  // 3. gh CLI token (fallback)
  try {
    const result = await execa('gh', ['auth', 'token']);
    return result.stdout.trim();
  } catch {
    throw new Error('GitHub token not found. Set GITHUB_TOKEN or run "gh auth login"');
  }
};
```

### Multi-Repository Management
```typescript
type OrganizationContext = {
  org: string;
  repositories: RepositoryInfo[];
  syncProgress: Map<string, SyncProgress>;
};

// Organization-wide sync with progress tracking
const syncOrganization = async (context: OrganizationContext): Promise<void> => {
  const repos = await discoverRepositories(context.org);
  
  // Parallel sync with bounded concurrency
  const semaphore = pLimit(context.config.concurrency);
  
  await Promise.all(repos.map(repo => 
    semaphore(() => syncRepository(repo, context))
  ));
  
  // Compute cross-repository analytics
  await computeOrganizationMetrics(context);
};
```

## Testing Strategy

### Multi-layered Testing for Analytics
1. **Unit Tests**: Metrics algorithms with known test data
2. **Integration Tests**: Database operations and multi-repo sync
3. **Analytics Tests**: Verify insights accuracy with synthetic datasets
4. **Contract Tests**: GitHub API response validation
5. **Performance Tests**: Large organization handling and query optimization

### Key Test Patterns
- Mock GitHub API responses for consistent analytics testing
- Use temporary SQLite databases for integration tests
- Generate synthetic PR data for testing edge cases
- Test quality scoring algorithms with various PR scenarios
- Validate analytics accuracy with known outcomes

### Test Commands
```bash
npm run test                    # Unit tests
npm run test:integration        # Integration tests with temp databases
npm run test:analytics         # Analytics accuracy tests
npm run test:performance       # Large dataset performance tests
```

## Implementation Priorities

### Phase 1 - Analytics Foundation
1. Multi-repository configuration and discovery
2. Analytics-optimized SQLite schema
3. Core metrics computation engine
4. Quality scoring algorithms

### Phase 2 - Management Insights
5. Team performance analytics
6. Individual developer profiles
7. Codebase area analysis
8. Knowledge gap detection

### Phase 3 - Reporting & Dashboards
9. CLI-based management reports
10. Export capabilities (CSV, JSON)
11. Trend analysis and forecasting
12. Collaboration network analysis

### Phase 4 - Advanced Analytics
13. Predictive analytics for capacity planning
14. Custom metrics and scoring
15. Real-time alerts and notifications
16. Integration APIs for external tools

## Management-Focused Design Principles

### Actionable Insights
- Every metric should answer a specific management question
- Focus on "so what?" rather than just data presentation
- Provide recommendations alongside analytics
- Support decision-making with trend analysis

### Privacy and Sensitivity
- Configurable developer anonymization
- Respect for individual privacy in team analytics
- Transparent data retention policies
- No external data transmission

### Scalability Considerations
- Support for organizations with hundreds of repositories
- Efficient incremental sync and processing
- Optimized queries for large datasets
- Parallel processing for multi-repo operations

## Key Management Questions Answered

### Team Performance
- Who are the top contributors in each area?
- How is work distributed across the team?
- What are the collaboration patterns?
- Where are the productivity bottlenecks?

### Code Quality
- Which developers write the highest quality code?
- How effective are our code review processes?
- What areas of the codebase need attention?
- How is quality trending over time?

### Knowledge Management
- Where are the knowledge silos?
- Who are the experts in each area?
- What's our bus factor risk?
- How can we improve knowledge distribution?

### Resource Planning
- What's our development velocity?
- How long do features typically take?
- Where should we focus hiring?
- What training opportunities exist?

## Implementation Plan & Workflow

### Current Status
- **Design Phase:** Complete analytics-focused design document
- **Foundation Phase:** Setting up project structure and dependencies
- **Next Milestone:** Core analytics database schema and metrics engine

### Development Workflow
1. **Management-First Design:** Every feature should provide management value
2. **Privacy-Aware Implementation:** Consider data sensitivity in all decisions  
3. **Scalability Focus:** Design for large organizations from the start
4. **Incremental Delivery:** Ship useful insights early and iterate

### Quality Gates for Analytics
- All metrics algorithms must have unit tests with known outcomes
- Analytics accuracy validated against synthetic datasets
- Performance tested with large repository simulations
- Privacy controls verified through integration tests

When implementing digest, always consider the management perspective and ensure features provide clear, actionable insights for engineering leadership.