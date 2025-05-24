import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { SqliteStore } from './sqlite_store.js';
import type { PullRequest, Review, Stats } from './types.js';

describe('SqliteStore', () => {
  let store: SqliteStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `digest-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new SqliteStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('PR operations', () => {
    const samplePR: PullRequest = {
      number: 123,
      repository: 'owner/repo',
      author: 'johndoe',
      title: 'Add new feature',
      created_at: '2024-01-01T10:00:00Z',
      merged_at: '2024-01-01T11:00:00Z',
      additions: 100,
      deletions: 50,
      changed_files: 5,
      has_tests: true,
      synced_at: '2024-01-01T12:00:00Z',
    };

    it('should add and retrieve PRs', () => {
      store.addPR(samplePR);
      const prs = store.getPRs();
      
      expect(prs).toHaveLength(1);
      expect(prs[0]).toEqual(samplePR);
    });

    it('should filter PRs by repository', () => {
      const pr2 = { ...samplePR, number: 124, repository: 'other/repo' };
      store.addPR(samplePR);
      store.addPR(pr2);

      const filtered = store.getPRs({ repository: 'owner/repo' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].number).toBe(123);
    });

    it('should filter PRs by author', () => {
      const pr2 = { ...samplePR, number: 124, author: 'janedoe' };
      store.addPR(samplePR);
      store.addPR(pr2);

      const filtered = store.getPRs({ author: 'johndoe' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].author).toBe('johndoe');
    });

    it('should update PRs', () => {
      store.addPR(samplePR);
      store.updatePR('owner/repo', 123, { title: 'Updated title', additions: 150 });

      const prs = store.getPRs();
      expect(prs[0].title).toBe('Updated title');
      expect(prs[0].additions).toBe(150);
      expect(prs[0].author).toBe('johndoe'); // unchanged
    });

    it('should delete PRs', () => {
      store.addPR(samplePR);
      store.deletePR('owner/repo', 123);

      const prs = store.getPRs();
      expect(prs).toHaveLength(0);
    });

    it('should replace PRs on duplicate insert', () => {
      store.addPR(samplePR);
      const updatedPR = { ...samplePR, title: 'Updated via replace' };
      store.addPR(updatedPR);

      const prs = store.getPRs();
      expect(prs).toHaveLength(1);
      expect(prs[0].title).toBe('Updated via replace');
    });
  });

  describe('Review operations', () => {
    const sampleReview: Review = {
      pr_number: 123,
      repository: 'owner/repo',
      reviewer: 'reviewer1',
      state: 'APPROVED',
      submitted_at: '2024-01-01T10:30:00Z',
      synced_at: '2024-01-01T12:00:00Z',
    };

    beforeEach(() => {
      // Add a PR first for foreign key constraint
      const pr: PullRequest = {
        number: 123,
        repository: 'owner/repo',
        author: 'author1',
        title: 'Test PR',
        created_at: '2024-01-01T10:00:00Z',
        merged_at: null,
        additions: 0,
        deletions: 0,
        changed_files: 0,
        has_tests: false,
        synced_at: '2024-01-01T12:00:00Z',
      };
      store.addPR(pr);
    });

    it('should add and retrieve reviews', () => {
      store.addReview(sampleReview);
      const reviews = store.getReviews();
      
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toEqual(sampleReview);
    });

    it('should filter reviews by repository', () => {
      const pr2: PullRequest = {
        number: 124,
        repository: 'other/repo',
        author: 'author2',
        title: 'Other PR',
        created_at: '2024-01-01T10:00:00Z',
        merged_at: null,
        additions: 0,
        deletions: 0,
        changed_files: 0,
        has_tests: false,
        synced_at: '2024-01-01T12:00:00Z',
      };
      store.addPR(pr2);

      const review2 = { ...sampleReview, pr_number: 124, repository: 'other/repo' };
      store.addReview(sampleReview);
      store.addReview(review2);

      const filtered = store.getReviews({ repository: 'owner/repo' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].pr_number).toBe(123);
    });

    it('should update reviews', () => {
      store.addReview(sampleReview);
      store.updateReview('owner/repo', 123, 'reviewer1', { state: 'CHANGES_REQUESTED' });

      const reviews = store.getReviews();
      expect(reviews[0].state).toBe('CHANGES_REQUESTED');
    });

    it('should delete reviews', () => {
      store.addReview(sampleReview);
      store.deleteReview('owner/repo', 123, 'reviewer1');

      const reviews = store.getReviews();
      expect(reviews).toHaveLength(0);
    });

    it('should cascade delete reviews when PR is deleted', () => {
      store.addReview(sampleReview);
      store.deletePR('owner/repo', 123);

      const reviews = store.getReviews();
      expect(reviews).toHaveLength(0);
    });
  });

  describe('Stats operations', () => {
    const sampleStats: Stats = {
      repository: 'owner/repo',
      author: 'johndoe',
      period_start: '2024-01-01',
      period_end: '2024-01-07',
      prs_created: 5,
      prs_merged: 4,
      lines_added: 500,
      lines_deleted: 100,
      reviews_given: 10,
      reviews_received: 8,
      avg_pr_size: 120.5,
      synced_at: '2024-01-08T12:00:00Z',
    };

    it('should add and retrieve stats', () => {
      store.addStats(sampleStats);
      const stats = store.getStats();
      
      expect(stats).toHaveLength(1);
      expect(stats[0]).toEqual(sampleStats);
    });

    it('should filter stats by repository', () => {
      const stats2 = { ...sampleStats, repository: 'other/repo' };
      store.addStats(sampleStats);
      store.addStats(stats2);

      const filtered = store.getStats({ repository: 'owner/repo' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].repository).toBe('owner/repo');
    });

    it('should filter stats by author', () => {
      const stats2 = { ...sampleStats, author: 'janedoe' };
      store.addStats(sampleStats);
      store.addStats(stats2);

      const filtered = store.getStats({ author: 'johndoe' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].author).toBe('johndoe');
    });

    it('should update stats', () => {
      store.addStats(sampleStats);
      store.updateStats('owner/repo', 'johndoe', '2024-01-01', { 
        prs_created: 6, 
        avg_pr_size: 150.0 
      });

      const stats = store.getStats();
      expect(stats[0].prs_created).toBe(6);
      expect(stats[0].avg_pr_size).toBe(150.0);
      expect(stats[0].prs_merged).toBe(4); // unchanged
    });

    it('should delete stats', () => {
      store.addStats(sampleStats);
      store.deleteStats('owner/repo', 'johndoe', '2024-01-01');

      const stats = store.getStats();
      expect(stats).toHaveLength(0);
    });

    it('should replace stats on duplicate insert', () => {
      store.addStats(sampleStats);
      const updatedStats = { ...sampleStats, prs_created: 10 };
      store.addStats(updatedStats);

      const stats = store.getStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].prs_created).toBe(10);
    });
  });

  describe('Database operations', () => {
    it('should provide access to underlying database', () => {
      const db = store.getDatabase();
      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe('function');
    });

    it('should close database connection', () => {
      expect(() => store.close()).not.toThrow();
    });

    it('should create database file', () => {
      expect(existsSync(dbPath)).toBe(true);
    });
  });
});