/**
 * Core types for digest analytics platform
 */

export type DigestConfig = {
  version?: string; // Config version for migrations
  github?: {
    token?: string; // GitHub token (saved after init)
    baseUrl?: string; // For GitHub Enterprise (optional)
    throttle?: {
      onRateLimit?: (retryAfter: number) => boolean;
      onSecondaryRateLimit?: (retryAfter: number) => boolean;
    };
  };
  repositories?: TrackedRepository[]; // Repositories being tracked
  settings?: {
    defaultTimeframe?: string; // Default timeframe for analytics (30d, 90d, 1y)
    autoSync?: boolean; // Future: automatic background sync
    syncIntervalHours?: number; // Future: sync frequency
    dataRetentionDays?: number; // Default 365
  };
  concurrency?: number; // Default 10
  outputDir?: string; // Default './digest'
  cacheDir?: string; // Default '~/.digest-cache'
  database?: {
    path?: string; // Default './.digest/digest.db'
  };
};

export type TrackedRepository = {
  name: string; // owner/repo format
  addedAt: string; // ISO timestamp when added to tracking
  lastSyncAt?: string; // ISO timestamp of last successful sync
  syncSince?: string; // Historical sync start point (YYYY-MM-DD)
  active: boolean; // Whether to include in sync operations
  errors?: SyncError[]; // Recent sync errors
};

export type SyncError = {
  timestamp: string; // ISO timestamp
  error: string; // Error message
  type: 'auth' | 'rate_limit' | 'network' | 'api' | 'unknown';
};

export type SyncState = {
  repository: string;
  lastSyncAt: string; // ISO timestamp of last successful sync
  lastPRUpdated: string; // Latest PR updated_at from last sync
  totalPRsSynced: number; // Running count for progress tracking
  errors: SyncError[]; // Track sync issues
  // Enhanced incremental sync tracking
  syncProgress?: {
    phase: 'fetching' | 'processing' | 'complete' | 'interrupted';
    lastProcessedPage?: number; // For fetching resumption
    lastProcessedPR?: number; // For processing resumption
    totalPRsFound?: number; // Total PRs discovered in this sync
    syncedPRIds: number[]; // PRs already processed in this sync session
    skippedPRIds: number[]; // PRs skipped (closed/merged, no changes)
    startedAt: string; // When this sync session started
    lastCheckpointAt?: string; // Last time we saved progress
  };
};

export type PRRecord = {
  number: number;
  repository: string;
  author: string;
  title: string;
  created_at: string;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  has_tests: boolean;
  synced_at: string;
};

export type ReviewRecord = {
  pr_number: number;
  repository: string;
  reviewer: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  submitted_at: string;
};

export type SimpleMetrics = {
  totalPRs: number;
  topContributors: Array<{ name: string; prs: number; lines: number }>;
  avgMergeTimeHours: number;
  avgReviewsPerPR: number;
  testRate: number; // % of PRs with tests
  avgPRSize: number; // lines changed
};

// Octokit-based GitHub data types
export type RawPR = {
  number: number;
  title: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  state: 'open' | 'closed';
  additions: number;
  deletions: number;
  changed_files: number;
  base: { ref: string };
  head: { ref: string };
};

export type RawReview = {
  id: number;
  user: { login: string } | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  submitted_at: string | null;
  body: string | null;
};

export type RawPRFile = {
  filename: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  previous_filename?: string;
};

export type GitHubAuthConfig = {
  token?: string;
  baseUrl?: string; // For GitHub Enterprise
};

export type SyncProgress = {
  phase: 'fetching' | 'processing' | 'storing' | 'complete';
  totalPRs: number;
  processedPRs: number;
  currentPR?: number;
  errors: Array<{ pr: number; error: string }>;
  // Enhanced progress tracking
  fetchProgress?: {
    currentPage: number;
    estimatedTotalPages?: number;
    prsThisPage: number;
    rateLimitRemaining: number;
    rateLimitResetAt?: string;
  };
  timeElapsed?: number; // milliseconds
  estimatedTimeRemaining?: number; // milliseconds
};