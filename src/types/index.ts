/**
 * Core types for digest analytics platform
 */

export type DigestConfig = {
  github?: {
    token?: string; // GitHub token (optional, will auto-detect)
    baseUrl?: string; // For GitHub Enterprise (optional)
    throttle?: {
      onRateLimit?: (retryAfter: number) => boolean;
      onSecondaryRateLimit?: (retryAfter: number) => boolean;
    };
  };
  concurrency?: number; // Default 10
  outputDir?: string; // Default './digest'
  cacheDir?: string; // Default '~/.digest-cache'
  dataRetentionDays?: number; // Default 365
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
};