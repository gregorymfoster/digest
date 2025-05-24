import { describe, it, expect } from 'vitest';
import {
  parseTimeframe,
  filterPRs,
  formatMergeTime,
  computeContributorMetrics,
  computeAllContributorMetrics,
  generateContributorSummary
} from './contributor_metrics.js';
import type { PullRequest, Review } from '../storage/index.js';

describe('ContributorMetrics', () => {
  const samplePRs: PullRequest[] = [
    {
      number: 1,
      repository: 'owner/repo1',
      author: 'alice',
      title: 'Add feature A',
      created_at: '2024-01-01T10:00:00Z',
      merged_at: '2024-01-01T14:00:00Z',
      additions: 100,
      deletions: 50,
      changed_files: 5,
      has_tests: true,
      synced_at: '2024-01-01T15:00:00Z'
    },
    {
      number: 2,
      repository: 'owner/repo1',
      author: 'bob',
      title: 'Fix bug B',
      created_at: '2024-01-02T09:00:00Z',
      merged_at: '2024-01-02T11:00:00Z',
      additions: 20,
      deletions: 10,
      changed_files: 2,
      has_tests: false,
      synced_at: '2024-01-02T12:00:00Z'
    },
    {
      number: 3,
      repository: 'owner/repo2',
      author: 'alice',
      title: 'Refactor C',
      created_at: '2024-01-03T08:00:00Z',
      merged_at: null,
      additions: 200,
      deletions: 100,
      changed_files: 8,
      has_tests: true,
      synced_at: '2024-01-03T09:00:00Z'
    },
    {
      number: 4,
      repository: 'owner/repo1',
      author: 'charlie',
      title: 'Update docs',
      created_at: '2023-12-01T10:00:00Z',
      merged_at: '2023-12-01T10:30:00Z',
      additions: 10,
      deletions: 5,
      changed_files: 1,
      has_tests: false,
      synced_at: '2023-12-01T11:00:00Z'
    }
  ];

  const sampleReviews: Review[] = [
    {
      pr_number: 1,
      repository: 'owner/repo1',
      reviewer: 'bob',
      state: 'APPROVED',
      submitted_at: '2024-01-01T12:00:00Z',
      synced_at: '2024-01-01T15:00:00Z'
    },
    {
      pr_number: 1,
      repository: 'owner/repo1',
      reviewer: 'charlie',
      state: 'CHANGES_REQUESTED',
      submitted_at: '2024-01-01T13:00:00Z',
      synced_at: '2024-01-01T15:00:00Z'
    },
    {
      pr_number: 2,
      repository: 'owner/repo1',
      reviewer: 'alice',
      state: 'APPROVED',
      submitted_at: '2024-01-02T10:00:00Z',
      synced_at: '2024-01-02T12:00:00Z'
    }
  ];

  describe('parseTimeframe', () => {
    it('should parse day timeframes', () => {
      const date = parseTimeframe('30d');
      const now = new Date();
      const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      expect(Math.abs(date.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should parse week timeframes', () => {
      const date = parseTimeframe('2w');
      const now = new Date();
      const expected = new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
      
      expect(Math.abs(date.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should parse ISO dates', () => {
      const date = parseTimeframe('2024-01-01');
      expect(date).toEqual(new Date('2024-01-01'));
    });

    it('should throw for invalid formats', () => {
      expect(() => parseTimeframe('invalid')).toThrow();
      expect(() => parseTimeframe('30x')).toThrow();
    });
  });

  describe('filterPRs', () => {
    it('should filter by timeframe', () => {
      const filtered = filterPRs(samplePRs, { timeframe: '2024-01-01' });
      expect(filtered).toHaveLength(3);
      expect(filtered.every(pr => new Date(pr.created_at) >= new Date('2024-01-01'))).toBe(true);
    });

    it('should filter by repositories', () => {
      const filtered = filterPRs(samplePRs, { repositories: ['owner/repo1'] });
      expect(filtered).toHaveLength(3);
      expect(filtered.every(pr => pr.repository === 'owner/repo1')).toBe(true);
    });

    it('should combine filters', () => {
      const filtered = filterPRs(samplePRs, {
        timeframe: '2024-01-01',
        repositories: ['owner/repo1']
      });
      expect(filtered).toHaveLength(2);
    });

    it('should return all PRs with no filters', () => {
      const filtered = filterPRs(samplePRs);
      expect(filtered).toHaveLength(4);
    });
  });

  describe('formatMergeTime', () => {
    it('should format minutes', () => {
      expect(formatMergeTime(0.5)).toBe('30m');
    });

    it('should format hours', () => {
      expect(formatMergeTime(2.5)).toBe('2.5h');
    });

    it('should format days', () => {
      expect(formatMergeTime(48)).toBe('2d');
    });
  });

  describe('computeContributorMetrics', () => {
    it('should compute basic metrics for a contributor', () => {
      const metrics = computeContributorMetrics('alice', samplePRs, sampleReviews);
      
      expect(metrics.author).toBe('alice');
      expect(metrics.prsCreated).toBe(2);
      expect(metrics.prsMerged).toBe(1);
      expect(metrics.linesAdded).toBe(300);
      expect(metrics.linesDeleted).toBe(150);
      expect(metrics.testsAddedCount).toBe(2);
      expect(metrics.testRate).toBe(100);
      expect(metrics.reviewsReceived).toBe(2);
      expect(metrics.repositories).toEqual(['owner/repo1', 'owner/repo2']);
    });

    it('should handle contributors with no PRs', () => {
      const metrics = computeContributorMetrics('nonexistent', samplePRs, sampleReviews);
      
      expect(metrics.author).toBe('nonexistent');
      expect(metrics.prsCreated).toBe(0);
      expect(metrics.prsMerged).toBe(0);
      expect(metrics.testRate).toBe(0);
      expect(metrics.avgPRSize).toBe(0);
    });

    it('should calculate average PR size correctly', () => {
      const metrics = computeContributorMetrics('alice', samplePRs, sampleReviews);
      
      // Alice has 2 PRs: (100+50) + (200+100) = 450 total lines, avg = 225
      expect(metrics.avgPRSize).toBe(225);
    });

    it('should calculate average merge time', () => {
      const metrics = computeContributorMetrics('alice', samplePRs, sampleReviews);
      
      // Alice has 1 merged PR: 4 hours to merge
      expect(metrics.avgTimeToMerge).toBe(4);
    });
  });

  describe('computeAllContributorMetrics', () => {
    it('should compute metrics for all contributors', () => {
      const allMetrics = computeAllContributorMetrics(samplePRs, sampleReviews);
      
      expect(allMetrics).toHaveLength(3);
      expect(allMetrics.map(m => m.author)).toEqual(
        expect.arrayContaining(['alice', 'bob', 'charlie'])
      );
    });

    it('should filter by timeframe', () => {
      const allMetrics = computeAllContributorMetrics(samplePRs, sampleReviews, {
        timeframe: '2024-01-01'
      });
      
      expect(allMetrics).toHaveLength(2); // Only alice and bob have PRs in 2024
      expect(allMetrics.map(m => m.author)).toEqual(
        expect.arrayContaining(['alice', 'bob'])
      );
    });

    it('should filter by repositories', () => {
      const allMetrics = computeAllContributorMetrics(samplePRs, sampleReviews, {
        repositories: ['owner/repo1']
      });
      
      expect(allMetrics).toHaveLength(3); // All contributors have PRs in repo1
      const aliceMetrics = allMetrics.find(m => m.author === 'alice')!;
      expect(aliceMetrics.prsCreated).toBe(1); // Only 1 PR in repo1
    });
  });

  describe('generateContributorSummary', () => {
    it('should generate complete summary', () => {
      const summary = generateContributorSummary(samplePRs, sampleReviews);
      
      expect(summary.totalContributors).toBe(3);
      expect(summary.totalPRs).toBe(4);
      expect(summary.totalLines).toBe(495); // Sum of all additions + deletions
      expect(summary.avgPRSize).toBe(123.75); // 495 / 4
      expect(summary.testRate).toBe(50); // 2 out of 4 PRs have tests
      expect(summary.topContributors).toHaveLength(3);
    });

    it('should sort contributors correctly', () => {
      const summary = generateContributorSummary(samplePRs, sampleReviews);
      
      const top = summary.topContributors;
      expect(top[0].author).toBe('alice'); // 2 PRs, most lines
      expect(top[0].prs).toBe(2);
      expect(top[0].lines).toBe(450);
    });

    it('should limit top contributors', () => {
      const summary = generateContributorSummary(samplePRs, sampleReviews, {
        limit: 2
      });
      
      expect(summary.topContributors).toHaveLength(2);
    });

    it('should handle empty data', () => {
      const summary = generateContributorSummary([], []);
      
      expect(summary.totalContributors).toBe(0);
      expect(summary.totalPRs).toBe(0);
      expect(summary.avgPRSize).toBe(0);
      expect(summary.testRate).toBe(0);
      expect(summary.topContributors).toHaveLength(0);
    });

    it('should include timeframe in summary', () => {
      const summary = generateContributorSummary(samplePRs, sampleReviews, {
        timeframe: '30d'
      });
      
      expect(summary.timeframe).toBe('30d');
    });
  });
});