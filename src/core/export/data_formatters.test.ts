import { describe, it, expect } from 'vitest';
import { formatAsJson, formatAsCsv } from './data_formatters.js';
import { AnalyticsResult } from '../analytics/pipeline.js';

const mockAnalyticsData: AnalyticsResult = {
  contributors: {
    totalContributors: 2,
    totalPRs: 8,
    totalLines: 380,
    avgPRSize: 47.5,
    testRate: 0.875,
    topContributors: [
      {
        author: 'john-doe',
        prs: 5,
        lines: 150,
        avgMergeTime: '1.0 days'
      },
      {
        author: 'jane-smith',
        prs: 3,
        lines: 230,
        avgMergeTime: '0.5 days'
      }
    ],
    timeframe: '30d'
  },
  reviews: {
    fastestReviews: [],
    slowestReviews: [],
    topReviewers: [
      {
        reviewer: 'reviewer1',
        reviewsGiven: 5,
        avgResponseTime: 2.5,
        approvalRate: 0.8,
        repositories: ['test/repo']
      }
    ],
    avgMetrics: {
      timeToFirstReview: '2.5 hours',
      timeToMerge: '18.25 hours',
      reviewsPerPR: 1.5
    },
    timeframe: '30d'
  },
  overview: {
    totalPRs: 8,
    totalContributors: 2,
    totalReviews: 12,
    timeframe: '30d',
    repositories: ['test/repo']
  },
  generatedAt: '2024-01-01T00:00:00.000Z'
};

describe('formatAsJson', () => {
  it('should format analytics data as JSON', () => {
    const result = formatAsJson(mockAnalyticsData);
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('contributors');
    expect(parsed).toHaveProperty('reviews');
    expect(parsed).toHaveProperty('overview');
    expect(parsed).toHaveProperty('generatedAt');
    
    expect(parsed.overview.totalPRs).toBe(8);
    expect(parsed.overview.totalContributors).toBe(2);
    expect(parsed.overview.totalReviews).toBe(12);
    expect(parsed.overview.timeframe).toBe('30d');
    expect(parsed.overview.repositories).toEqual(['test/repo']);
    expect(parsed.generatedAt).toBe('2024-01-01T00:00:00.000Z');
  });
  
  it('should include all contributor fields', () => {
    const result = formatAsJson(mockAnalyticsData);
    const parsed = JSON.parse(result);
    
    expect(parsed.contributors.totalContributors).toBe(2);
    expect(parsed.contributors.totalPRs).toBe(8);
    expect(parsed.contributors.testRate).toBe(0.875);
    expect(parsed.contributors.topContributors).toHaveLength(2);
    
    const topContributor = parsed.contributors.topContributors[0];
    expect(topContributor).toHaveProperty('author', 'john-doe');
    expect(topContributor).toHaveProperty('prs', 5);
    expect(topContributor).toHaveProperty('lines', 150);
    expect(topContributor).toHaveProperty('avgMergeTime', '1.0 days');
  });
});

describe('formatAsCsv', () => {
  it('should format analytics data as CSV with proper headers', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('# Digest Analytics Export');
    expect(result).toContain('# Timeframe: 30d');
    expect(result).toContain('# Repositories: test/repo');
    expect(result).toContain('## Summary');
    expect(result).toContain('## Top Contributors');
    expect(result).toContain('## Review Metrics');
    expect(result).toContain('## Top Reviewers');
  });
  
  it('should include summary metrics', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('total_prs,8');
    expect(result).toContain('total_contributors,2');
    expect(result).toContain('total_reviews,12');
    expect(result).toContain('avg_pr_size,47.50');
    expect(result).toContain('test_rate,87.5%');
  });
  
  it('should include contributor data with proper CSV formatting', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('rank,author,prs,lines_changed,avg_merge_time');
    expect(result).toContain('1,john-doe,5,150,1.0 days');
    expect(result).toContain('2,jane-smith,3,230,0.5 days');
  });
  
  it('should include review metrics', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('avg_time_to_first_review,2.5 hours');
    expect(result).toContain('avg_time_to_merge,18.25 hours');
    expect(result).toContain('avg_reviews_per_pr,1.50');
  });
  
  it('should include reviewer data', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('reviewer,reviews_given,avg_response_time_hours,approval_rate,repositories');
    expect(result).toContain('reviewer1,5,2.50,80.0%,test/repo');
  });
  
  it('should use generated timestamp', () => {
    const result = formatAsCsv(mockAnalyticsData);
    
    expect(result).toContain('# Generated: 2024-01-01T00:00:00.000Z');
  });
});