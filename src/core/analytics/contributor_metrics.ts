import type { PullRequest, Review } from '../storage/index.js';

export interface ContributorMetrics {
  author: string;
  timeframe: string;
  prsCreated: number;
  prsMerged: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  avgPRSize: number;
  testsAddedCount: number;
  testRate: number; // Percentage of PRs with tests
  reviewsReceived: number;
  avgTimeToMerge: number; // Hours
  repositories: string[];
}

export interface TopContributor {
  author: string;
  prs: number;
  lines: number;
  avgMergeTime: string; // Human readable
}

export interface ContributorSummary {
  totalContributors: number;
  totalPRs: number;
  totalLines: number;
  avgPRSize: number;
  testRate: number;
  topContributors: TopContributor[];
  timeframe: string;
}

export interface ContributorMetricsOptions {
  timeframe?: string; // '7d', '30d', '90d', '1y' or ISO date
  limit?: number; // Number of top contributors to return
  repositories?: string[]; // Filter by specific repositories
  includeTests?: boolean; // Include test-related metrics
}

/**
 * Parse timeframe string to get start date
 */
export const parseTimeframe = (timeframe: string): Date => {
  const now = new Date();
  
  if (timeframe.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // ISO date format
    return new Date(timeframe);
  }
  
  const match = timeframe.match(/^(\d+)([dwmy])$/);
  if (!match) {
    throw new Error(`Invalid timeframe format: ${timeframe}. Use format like '30d', '1w', '3m', '1y' or ISO date`);
  }
  
  const [, amount, unit] = match;
  const value = parseInt(amount, 10);
  
  switch (unit) {
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'w':
      return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case 'm':
      return new Date(now.getFullYear(), now.getMonth() - value, now.getDate());
    case 'y':
      return new Date(now.getFullYear() - value, now.getMonth(), now.getDate());
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

/**
 * Filter PRs by timeframe and repositories
 */
export const filterPRs = (
  prs: PullRequest[], 
  options: ContributorMetricsOptions = {}
): PullRequest[] => {
  let filtered = [...prs];
  
  // Filter by timeframe
  if (options.timeframe) {
    const startDate = parseTimeframe(options.timeframe);
    filtered = filtered.filter(pr => new Date(pr.created_at) >= startDate);
  }
  
  // Filter by repositories
  if (options.repositories && options.repositories.length > 0) {
    filtered = filtered.filter(pr => options.repositories!.includes(pr.repository));
  }
  
  return filtered;
};

/**
 * Calculate time difference in hours
 */
const getHoursDiff = (start: string, end: string | null): number => {
  if (!end) return 0;
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
};

/**
 * Format hours to human readable time
 */
export const formatMergeTime = (hours: number): string => {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`;
  } else {
    const days = Math.round(hours / 24 * 10) / 10;
    return `${days}d`;
  }
};

/**
 * Compute metrics for a single contributor
 */
export const computeContributorMetrics = (
  author: string,
  prs: PullRequest[],
  reviews: Review[],
  options: ContributorMetricsOptions = {}
): ContributorMetrics => {
  // Filter PRs for this author
  const authorPRs = prs.filter(pr => pr.author === author);
  const mergedPRs = authorPRs.filter(pr => pr.merged_at !== null);
  
  // Calculate basic stats
  const prsCreated = authorPRs.length;
  const prsMerged = mergedPRs.length;
  const linesAdded = authorPRs.reduce((sum, pr) => sum + pr.additions, 0);
  const linesDeleted = authorPRs.reduce((sum, pr) => sum + pr.deletions, 0);
  const filesChanged = authorPRs.reduce((sum, pr) => sum + pr.changed_files, 0);
  
  // Test-related metrics
  const testsAddedCount = authorPRs.filter(pr => pr.has_tests).length;
  const testRate = prsCreated > 0 ? (testsAddedCount / prsCreated) * 100 : 0;
  
  // Review metrics
  const reviewsReceived = reviews.filter(review => 
    authorPRs.some(pr => pr.number === review.pr_number && pr.repository === review.repository)
  ).length;
  
  // Time to merge calculation
  const mergeHours = mergedPRs
    .map(pr => getHoursDiff(pr.created_at, pr.merged_at))
    .filter(hours => hours > 0);
  const avgTimeToMerge = mergeHours.length > 0 
    ? mergeHours.reduce((sum, hours) => sum + hours, 0) / mergeHours.length 
    : 0;
  
  // Repository coverage
  const repositories = [...new Set(authorPRs.map(pr => pr.repository))];
  
  return {
    author,
    timeframe: options.timeframe || 'all',
    prsCreated,
    prsMerged,
    linesAdded,
    linesDeleted,
    filesChanged,
    avgPRSize: prsCreated > 0 ? (linesAdded + linesDeleted) / prsCreated : 0,
    testsAddedCount,
    testRate,
    reviewsReceived,
    avgTimeToMerge,
    repositories
  };
};

/**
 * Compute metrics for all contributors
 */
export const computeAllContributorMetrics = (
  prs: PullRequest[],
  reviews: Review[],
  options: ContributorMetricsOptions = {}
): ContributorMetrics[] => {
  // Filter PRs based on options
  const filteredPRs = filterPRs(prs, options);
  
  // Get unique authors
  const authors = [...new Set(filteredPRs.map(pr => pr.author))];
  
  // Compute metrics for each author
  return authors.map(author => 
    computeContributorMetrics(author, filteredPRs, reviews, options)
  );
};

/**
 * Generate contributor summary with top contributors
 */
export const generateContributorSummary = (
  prs: PullRequest[],
  reviews: Review[],
  options: ContributorMetricsOptions = {}
): ContributorSummary => {
  const filteredPRs = filterPRs(prs, options);
  const allMetrics = computeAllContributorMetrics(prs, reviews, options);
  
  // Sort by PR count, then by lines changed
  const sortedMetrics = allMetrics.sort((a, b) => {
    if (b.prsCreated !== a.prsCreated) {
      return b.prsCreated - a.prsCreated;
    }
    return (b.linesAdded + b.linesDeleted) - (a.linesAdded + a.linesDeleted);
  });
  
  // Get top contributors
  const limit = options.limit || 10;
  const topContributors: TopContributor[] = sortedMetrics
    .slice(0, limit)
    .map(metrics => ({
      author: metrics.author,
      prs: metrics.prsCreated,
      lines: metrics.linesAdded + metrics.linesDeleted,
      avgMergeTime: formatMergeTime(metrics.avgTimeToMerge)
    }));
  
  // Calculate overall stats
  const totalPRs = filteredPRs.length;
  const totalLines = filteredPRs.reduce((sum, pr) => sum + pr.additions + pr.deletions, 0);
  const avgPRSize = totalPRs > 0 ? totalLines / totalPRs : 0;
  const prsWithTests = filteredPRs.filter(pr => pr.has_tests).length;
  const testRate = totalPRs > 0 ? (prsWithTests / totalPRs) * 100 : 0;
  
  return {
    totalContributors: allMetrics.length,
    totalPRs,
    totalLines,
    avgPRSize,
    testRate,
    topContributors,
    timeframe: options.timeframe || 'all'
  };
};