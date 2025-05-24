import { describe, it, expect } from 'vitest';
import {
  computePRReviewTiming,
  computeReviewerStats,
  computeReviewMetrics,
  generateReviewSummary
} from './review_metrics.js';
import type { PullRequest, Review } from '../storage/index.js';

describe('ReviewMetrics', () => {
  const samplePRs: PullRequest[] = [
    {
      number: 1,
      repository: 'owner/repo',
      author: 'alice',
      title: 'Add feature A',
      created_at: '2024-01-01T10:00:00Z',
      merged_at: '2024-01-01T16:00:00Z', // 6 hours to merge
      additions: 100,
      deletions: 50,
      changed_files: 5,
      has_tests: true,
      synced_at: '2024-01-01T17:00:00Z'
    },
    {
      number: 2,
      repository: 'owner/repo',
      author: 'bob',
      title: 'Fix bug B',
      created_at: '2024-01-02T09:00:00Z',
      merged_at: '2024-01-02T15:00:00Z', // 6 hours to merge
      additions: 20,
      deletions: 10,
      changed_files: 2,
      has_tests: false,
      synced_at: '2024-01-02T16:00:00Z'
    },
    {
      number: 3,
      repository: 'owner/repo',
      author: 'charlie',
      title: 'Update docs',
      created_at: '2024-01-03T08:00:00Z',
      merged_at: null, // Not merged
      additions: 10,
      deletions: 5,
      changed_files: 1,
      has_tests: false,
      synced_at: '2024-01-03T09:00:00Z'
    }
  ];

  const sampleReviews: Review[] = [
    {
      pr_number: 1,
      repository: 'owner/repo',
      reviewer: 'bob',
      state: 'APPROVED',
      submitted_at: '2024-01-01T12:00:00Z', // 2 hours after PR creation
      synced_at: '2024-01-01T17:00:00Z'
    },
    {
      pr_number: 1,
      repository: 'owner/repo',
      reviewer: 'charlie',
      state: 'CHANGES_REQUESTED',
      submitted_at: '2024-01-01T14:00:00Z', // 4 hours after PR creation
      synced_at: '2024-01-01T17:00:00Z'
    },
    {
      pr_number: 2,
      repository: 'owner/repo',
      reviewer: 'alice',
      state: 'APPROVED',
      submitted_at: '2024-01-02T10:00:00Z', // 1 hour after PR creation
      synced_at: '2024-01-02T16:00:00Z'
    },
    {
      pr_number: 2,
      repository: 'owner/repo',
      reviewer: 'charlie',
      state: 'APPROVED',
      submitted_at: '2024-01-02T11:00:00Z', // 2 hours after PR creation
      synced_at: '2024-01-02T16:00:00Z'
    },
    {
      pr_number: 3,
      repository: 'owner/repo',
      reviewer: 'alice',
      state: 'COMMENTED',
      submitted_at: '2024-01-03T10:00:00Z', // 2 hours after PR creation
      synced_at: '2024-01-03T11:00:00Z'
    }
  ];

  describe('computePRReviewTiming', () => {
    it('should calculate review timing for merged PR', () => {
      const pr = samplePRs[0]; // PR #1
      const prReviews = sampleReviews.filter(r => r.pr_number === 1);
      
      const timing = computePRReviewTiming(pr, prReviews);
      
      expect(timing.prNumber).toBe(1);
      expect(timing.timeToFirstReview).toBe(2); // First review at 2 hours
      expect(timing.timeToMerge).toBe(6); // Merged at 6 hours
      expect(timing.reviewCount).toBe(2);
      expect(timing.approvals).toBe(1);
      expect(timing.changesRequested).toBe(1);
    });

    it('should handle unmerged PR', () => {
      const pr = samplePRs[2]; // PR #3 (not merged)
      const prReviews = sampleReviews.filter(r => r.pr_number === 3);
      
      const timing = computePRReviewTiming(pr, prReviews);
      
      expect(timing.timeToMerge).toBeNull();
      expect(timing.timeToFirstReview).toBe(2);
      expect(timing.reviewCount).toBe(1);
    });

    it('should handle PR with no reviews', () => {
      const pr = samplePRs[0];
      const timing = computePRReviewTiming(pr, []);
      
      expect(timing.timeToFirstReview).toBeNull();
      expect(timing.reviewCount).toBe(0);
      expect(timing.approvals).toBe(0);
    });
  });

  describe('computeReviewerStats', () => {
    it('should compute stats for active reviewer', () => {
      const stats = computeReviewerStats('alice', sampleReviews, samplePRs);
      
      expect(stats.reviewer).toBe('alice');
      expect(stats.reviewsGiven).toBe(2);
      expect(stats.avgResponseTime).toBe(1.5); // (1 + 2) / 2 hours
      expect(stats.approvalRate).toBe(50); // 1 approval out of 2 reviews
      expect(stats.repositories).toEqual(['owner/repo']);
    });

    it('should compute stats for reviewer with all approvals', () => {
      const stats = computeReviewerStats('bob', sampleReviews, samplePRs);
      
      expect(stats.reviewsGiven).toBe(1);
      expect(stats.approvalRate).toBe(100);
      expect(stats.avgResponseTime).toBe(2);
    });

    it('should handle reviewer with no reviews', () => {
      const stats = computeReviewerStats('nonexistent', sampleReviews, samplePRs);
      
      expect(stats.reviewsGiven).toBe(0);
      expect(stats.avgResponseTime).toBe(0);
      expect(stats.approvalRate).toBe(0);
      expect(stats.repositories).toEqual([]);
    });
  });

  describe('computeReviewMetrics', () => {
    it('should compute comprehensive metrics', () => {
      const metrics = computeReviewMetrics(samplePRs, sampleReviews);
      
      expect(metrics.totalReviews).toBe(5);
      expect(metrics.totalPRs).toBe(3);
      expect(metrics.avgReviewsPerPR).toBe(5/3);
      expect(metrics.avgTimeToFirstReview).toBe(5/3); // (2 + 1 + 2) / 3
      expect(metrics.avgTimeToMerge).toBe(6); // (6 + 6) / 2 merged PRs
      expect(metrics.approvalRate).toBe(60); // 3 approvals out of 5 reviews
      expect(metrics.reviewerStats).toHaveLength(3);
    });

    it('should filter by timeframe', () => {
      const metrics = computeReviewMetrics(samplePRs, sampleReviews, {
        timeframe: '2024-01-02'
      });
      
      expect(metrics.totalPRs).toBe(2); // PR #2 and #3
      expect(metrics.totalReviews).toBe(3); // Reviews for PR #2 and #3
    });

    it('should filter by repository', () => {
      const otherRepoPR: PullRequest = {
        ...samplePRs[0],
        number: 4,
        repository: 'other/repo'
      };
      
      const metrics = computeReviewMetrics(
        [...samplePRs, otherRepoPR],
        sampleReviews,
        { repositories: ['owner/repo'] }
      );
      
      expect(metrics.totalPRs).toBe(3); // Only original repo PRs
    });

    it('should handle empty data', () => {
      const metrics = computeReviewMetrics([], []);
      
      expect(metrics.totalReviews).toBe(0);
      expect(metrics.totalPRs).toBe(0);
      expect(metrics.avgReviewsPerPR).toBe(0);
      expect(metrics.avgTimeToFirstReview).toBe(0);
      expect(metrics.avgTimeToMerge).toBe(0);
      expect(metrics.reviewerStats).toHaveLength(0);
    });
  });

  describe('generateReviewSummary', () => {
    it('should generate complete summary', () => {
      const summary = generateReviewSummary(samplePRs, sampleReviews);
      
      expect(summary.fastestReviews).toHaveLength(3);
      expect(summary.slowestReviews).toHaveLength(3);
      expect(summary.topReviewers).toHaveLength(3);
      
      // Check that fastest review is actually fastest
      const fastest = summary.fastestReviews[0];
      expect(fastest.timeToFirstReview).toBe(1); // PR #2 had first review after 1 hour
      
      // Check that slowest review is actually slowest
      const slowest = summary.slowestReviews[0];
      expect(slowest.timeToFirstReview).toBe(2); // PR #1 or #3 had first review after 2 hours
      
      // Check average metrics formatting
      expect(summary.avgMetrics.timeToFirstReview).toMatch(/[0-9.]+[hmd]/);
      expect(summary.avgMetrics.timeToMerge).toMatch(/[0-9.]+[hmd]/);
      expect(typeof summary.avgMetrics.reviewsPerPR).toBe('number');
    });

    it('should sort reviewers by review count', () => {
      const summary = generateReviewSummary(samplePRs, sampleReviews);
      
      const reviewCounts = summary.topReviewers.map(r => r.reviewsGiven);
      const sortedCounts = [...reviewCounts].sort((a, b) => b - a);
      expect(reviewCounts).toEqual(sortedCounts);
    });

    it('should include timeframe', () => {
      const summary = generateReviewSummary(samplePRs, sampleReviews, {
        timeframe: '30d'
      });
      
      expect(summary.timeframe).toBe('30d');
    });

    it('should handle PRs with no reviews', () => {
      const prsWithoutReviews: PullRequest[] = [
        {
          number: 10,
          repository: 'owner/repo',
          author: 'solo',
          title: 'Solo work',
          created_at: '2024-01-01T10:00:00Z',
          merged_at: '2024-01-01T11:00:00Z',
          additions: 5,
          deletions: 2,
          changed_files: 1,
          has_tests: false,
          synced_at: '2024-01-01T12:00:00Z'
        }
      ];
      
      const summary = generateReviewSummary(prsWithoutReviews, []);
      
      expect(summary.fastestReviews).toHaveLength(0);
      expect(summary.slowestReviews).toHaveLength(0);
      expect(summary.topReviewers).toHaveLength(0);
    });
  });
});