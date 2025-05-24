# Digest: Management Analytics Platform for Software Teams

## Overview

Digest is a management analytics tool that provides actionable insights into software development teams by analyzing GitHub pull request data. It focuses on **who is building what** and delivers the metrics engineering managers need to make informed decisions about team productivity, code quality, and development patterns.

## Goals

### Primary Goals
- **Team Performance Analytics**: Comprehensive contributor analysis and productivity metrics
- **Review Effectiveness**: Detailed review turnaround times and collaboration patterns  
- **Quality Indicators**: Test coverage rates, review thoroughness, and code change patterns
- **Management Reports**: Export capabilities and dashboard-style insights for leadership

### Management Questions Answered
- Who are the top contributors and how is work distributed?
- How efficient are our code review processes?
- What's our test coverage rate and quality trends?
- Where are the collaboration bottlenecks?
- How can we optimize team productivity?

### MVP Scope (Phase 1)
Start with single-repository focus and essential commands before expanding to full platform.

## Architecture

### Design Principles
- **Simple and Fast**: Focus on essential insights that managers actually use
- **Single Repository**: Master one repo before attempting multi-repo complexity
- **CSV-First**: Export data for analysis in existing management tools
- **Incremental Sync**: Resumable sync with efficient caching

### Core Components

```
src/
├── cli/              # 4 essential commands
├── core/             # Business logic
│   ├── sync/         # GitHub data collection
│   ├── stats/        # Simple aggregations
│   └── export/       # CSV/JSON output
└── types/            # Basic TypeScript definitions
```

## Data Model

### Simplified Schema for Essential Insights

```sql
-- Core PR data (simplified)
CREATE TABLE prs (
  number INTEGER,
  repository TEXT,
  author TEXT NOT NULL,
  title TEXT,
  created_at TEXT,
  merged_at TEXT,
  
  -- Size metrics
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,
  
  -- Simple quality indicators
  has_tests BOOLEAN DEFAULT FALSE,
  
  -- Sync metadata
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (repository, number)
);

-- Code review data (simplified)
CREATE TABLE reviews (
  pr_number INTEGER NOT NULL,
  repository TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  state TEXT NOT NULL, -- APPROVED, CHANGES_REQUESTED, COMMENTED
  submitted_at TEXT,
  
  FOREIGN KEY (repository, pr_number) REFERENCES prs(repository, number)
);

-- Pre-computed simple statistics
CREATE TABLE stats (
  subject TEXT NOT NULL, -- developer name or "overall"
  repository TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  
  -- Basic metrics
  prs_count INTEGER DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  avg_merge_hours REAL DEFAULT 0,
  test_rate REAL DEFAULT 0, -- % of PRs with tests
  
  computed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (subject, repository, period_start, period_end)
);
```

### Essential Indexes

```sql
CREATE INDEX idx_prs_author ON prs(author);
CREATE INDEX idx_prs_merged_at ON prs(merged_at);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer);
```

## GitHub Integration Strategy

### Octokit REST API Integration
- **Direct GitHub API**: Use `@octokit/rest` for reliable, well-typed API access
- **Authentication hierarchy**: GitHub token → gh CLI token → environment variable
- **Rate limiting**: Built-in rate limiting with exponential backoff
- **Comprehensive data**: Access to full PR and review metadata

### Essential API Calls
```typescript
// List PRs for incremental sync
await octokit.rest.pulls.list({
  owner,
  repo,
  state: 'closed',
  sort: 'updated',
  direction: 'desc',
  per_page: 100
});

// Get detailed PR data including reviews
await octokit.rest.pulls.get({
  owner,
  repo,
  pull_number: prNumber
});

// Get PR reviews
await octokit.rest.pulls.listReviews({
  owner,
  repo,
  pull_number: prNumber
});

// Get PR files for test detection
await octokit.rest.pulls.listFiles({
  owner,
  repo,
  pull_number: prNumber
});
```

### Authentication Strategy
```typescript
// Authentication hierarchy (same as ylog)
const auth = 
  process.env.GITHUB_TOKEN ||           // 1. Environment variable
  process.env.GH_TOKEN ||               // 2. GitHub CLI environment
  await getGhCliToken() ||              // 3. gh CLI token
  config.github?.token;                 // 4. Config file token
```

## Simple Analytics

### Basic Metrics Computation

```typescript
interface SimpleMetrics {
  // Contributor insights
  totalPRs: number;
  topContributors: Array<{ name: string; prs: number; lines: number }>;
  
  // Review efficiency
  avgMergeTimeHours: number;
  avgReviewsPerPR: number;
  
  // Quality indicators
  testRate: number; // % of PRs with tests
  avgPRSize: number; // lines changed
}
```

### Test Detection Logic

```typescript
const hasTests = (pr: PRData): boolean => {
  // Simple heuristics for test detection
  const testPatterns = [
    /\.test\./,
    /\.spec\./,
    /\/tests?\//,
    /__tests__/
  ];
  
  return pr.files?.some(file => 
    testPatterns.some(pattern => pattern.test(file.path))
  ) || false;
};
```

## CLI Interface

### Workspace Concept

Digest operates as a **stateful workspace** for team analytics:

- **Persistent configuration**: Stores GitHub token, tracked repositories, and sync preferences
- **Incremental sync**: Remembers last sync point for efficient updates
- **Multi-repository tracking**: Manages multiple repos as a cohesive analytics workspace
- **Background-friendly**: Designed for scheduled/automated syncing

### Essential Commands (MVP)

```bash
# Initial setup (one-time)
digest init                           # Initialize workspace, save token
digest add <owner/repo>               # Add repository to tracking
digest add <owner/repo> --since 90d   # Add repo with historical data

# Data collection (can be automated)
digest sync                           # Sync all tracked repos incrementally
digest sync <owner/repo>              # Sync specific repo only
digest sync --force                   # Full re-sync (ignore last sync point)

# Workspace management
digest list                           # List tracked repositories
digest remove <owner/repo>            # Remove repo from tracking
digest status                         # Show last sync times and repo status

# Analytics (work on all tracked data)
digest contributors                   # Top contributors across all repos
digest contributors --repo <name>     # Contributors for specific repo
digest contributors --timeframe 30d   # Contributors in last 30 days

digest reviews                        # Review analytics across all repos
digest reviews --reviewer <name>      # Specific reviewer stats
digest reviews --repo <owner/repo>    # Reviews for specific repo

# Data export
digest export --csv                   # Export all data to CSV
digest export --json                  # Export all data to JSON
digest export --repo <owner/repo>     # Export specific repo data
```

### Workspace Configuration

Digest maintains persistent state in a local workspace configuration:

```typescript
// .digest/config.json
{
  "version": "1.0",
  "github": {
    "token": "ghp_xxxxxxxxxxxx",        // Saved GitHub token
    "baseUrl": "https://api.github.com" // For enterprise instances
  },
  "repositories": [
    {
      "name": "facebook/react",
      "addedAt": "2024-01-15T10:00:00Z",
      "lastSyncAt": "2024-01-20T15:30:00Z",
      "syncSince": "2024-01-01",         // Historical sync start point
      "active": true
    },
    {
      "name": "microsoft/typescript", 
      "addedAt": "2024-01-16T09:00:00Z",
      "lastSyncAt": "2024-01-20T15:32:00Z",
      "syncSince": "2024-01-01",
      "active": true
    }
  ],
  "settings": {
    "defaultTimeframe": "30d",
    "autoSync": false,              // Future: automatic background sync
    "syncIntervalHours": 6,         // Future: sync frequency
    "dataRetentionDays": 365
  }
}
```

### Typical Workflow with State

```bash
# One-time setup (saves token and preferences)
cd ~/team-analytics
digest init
# Prompts for GitHub token, saves to .digest/config.json

# Add repositories to track
digest add facebook/react --since 90d
digest add microsoft/typescript --since 90d
# Updates config.json with tracked repos

# Regular sync (can be automated)
digest sync
# Syncs all tracked repos incrementally from last sync point
# Updates lastSyncAt timestamps in config

# Generate insights across all data
digest contributors --timeframe 30d
digest reviews
digest export --csv

# Check workspace status
digest status
# Shows:
# ✓ facebook/react      Last sync: 2 hours ago    (1,247 PRs)  
# ✓ microsoft/typescript Last sync: 2 hours ago    (892 PRs)
# ✗ myorg/internal      Sync failed: API rate limit
```

### Incremental Sync Strategy

```typescript
// Track sync state per repository
interface SyncState {
  repository: string;
  lastSyncAt: string;          // ISO timestamp of last successful sync
  lastPRUpdated: string;       // Latest PR updated_at from last sync
  totalPRsSynced: number;      // Running count for progress tracking
  errors: Array<{             // Track sync issues
    timestamp: string;
    error: string;
  }>;
}

// Efficient incremental sync
await octokit.rest.pulls.list({
  owner,
  repo,
  state: 'all',
  sort: 'updated',
  direction: 'desc',
  since: lastSyncState.lastPRUpdated,  // Only fetch updated PRs
  per_page: 100
});
```

### Simple Report Outputs

```bash
# Contributors command output
Top Contributors (Last 30 days):
1. alice    15 PRs  (+2,431 -892 lines)   avg: 2.3d merge time
2. bob      12 PRs  (+1,876 -434 lines)   avg: 1.8d merge time  
3. carol     8 PRs  (+987 -123 lines)     avg: 3.1d merge time

Tests: 68% of PRs include tests
Avg PR size: 156 lines changed

# Reviews command output  
Review Turnaround Times:
Average time to first review: 8.4 hours
Average time to merge: 2.1 days

Top Reviewers:
1. alice      23 reviews   avg: 4.2h response
2. bob        18 reviews   avg: 6.8h response
3. carol      15 reviews   avg: 12.1h response
```

## Implementation Strategy

### Phase 1: MVP (2-3 weeks)
1. **Basic GitHub sync** for single repository
2. **Simplified SQLite schema** (3 tables)
3. **4 essential CLI commands** (sync, contributors, reviews, export)
4. **CSV export functionality**

### Phase 2: Polish (1-2 weeks)  
1. **Time range filtering** (--since, --timeframe options)
2. **Better CLI output formatting** with tables and colors
3. **Incremental sync** optimization
4. **Error handling** and progress indicators

### Phase 3: Expand (2-3 weeks)
1. **JSON export** in addition to CSV
2. **Additional metrics** (PR size distribution, review patterns)
3. **Multi-repository support** (after proving single-repo value)
4. **Configuration file** for default settings

### Future Considerations
- Advanced analytics (only after MVP proves valuable)
- Integration with other tools
- Web dashboard (if CLI proves insufficient)

## Technology Stack

- **Language**: TypeScript (following ylog patterns)
- **Database**: JSON files for MVP (SQLite later when Node compatibility improves)
- **GitHub Integration**: Octokit REST API with authentication hierarchy
- **CLI Framework**: Commander.js with ora progress indicators
- **Data Processing**: Functional approach with p-limit concurrency control
- **Exports**: CSV first, JSON later

## Success Metrics

### MVP Success Criteria
- Can sync a real repository in under 2 minutes
- Generates useful contributor insights managers actually want
- CSV export works with existing management tools (Excel, Google Sheets)
- Zero setup complexity (works with existing gh CLI auth)

### Future Growth
- Adoption by teams who found initial insights valuable
- Requests for additional metrics (indicates usage)
- Multi-repository usage patterns
- Integration requests with existing tools

---

This simplified design focuses on shipping a useful MVP quickly rather than building a comprehensive analytics platform. The goal is to prove value with essential insights before adding complexity.