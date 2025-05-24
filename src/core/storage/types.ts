import type Database from 'better-sqlite3';

export interface PullRequest {
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
}

export interface Review {
  pr_number: number;
  repository: string;
  reviewer: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  submitted_at: string;
  synced_at: string;
}

export interface Stats {
  repository: string;
  author: string;
  period_start: string;
  period_end: string;
  prs_created: number;
  prs_merged: number;
  lines_added: number;
  lines_deleted: number;
  reviews_given: number;
  reviews_received: number;
  avg_pr_size: number;
  synced_at: string;
}

export interface StorageInterface {
  close(): void;
  
  getPRs(filters?: Partial<Pick<PullRequest, 'repository' | 'author'>>): PullRequest[];
  addPR(pr: PullRequest): void;
  updatePR(repository: string, number: number, updates: Partial<PullRequest>): void;
  deletePR(repository: string, number: number): void;
  
  getReviews(filters?: Partial<Pick<Review, 'repository' | 'reviewer' | 'pr_number'>>): Review[];
  addReview(review: Review): void;
  updateReview(repository: string, pr_number: number, reviewer: string, updates: Partial<Review>): void;
  deleteReview(repository: string, pr_number: number, reviewer: string): void;
  
  getStats(filters?: Partial<Pick<Stats, 'repository' | 'author'>>): Stats[];
  addStats(stats: Stats): void;
  updateStats(repository: string, author: string, period_start: string, updates: Partial<Stats>): void;
  deleteStats(repository: string, author: string, period_start: string): void;
}

export interface DatabaseProvider {
  getDatabase(): Database.Database;
}