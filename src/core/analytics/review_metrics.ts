import type { PullRequest, Review } from '../storage/index.js';
import { filterPRs, formatMergeTime } from './contributor_metrics.js';
import type { ContributorMetricsOptions } from './contributor_metrics.js';

export interface ReviewMetrics {
  totalReviews: number;
  totalPRs: number;
  avgReviewsPerPR: number;
  avgTimeToFirstReview: number; // Hours
  avgTimeToMerge: number; // Hours
  reviewerStats: ReviewerStats[];
  approvalRate: number; // Percentage of reviews that are approvals
  timeframe: string;
}

export interface ReviewerStats {
  reviewer: string;
  reviewsGiven: number;
  avgResponseTime: number; // Hours
  approvalRate: number; // Percentage
  repositories: string[];
}

export interface ReviewTiming {
  prNumber: number;
  repository: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  timeToFirstReview: number | null; // Hours
  timeToMerge: number | null; // Hours
  reviewCount: number;
  approvals: number;
  changesRequested: number;
}

export interface ReviewSummary {
  fastestReviews: ReviewTiming[];
  slowestReviews: ReviewTiming[];
  topReviewers: ReviewerStats[];
  avgMetrics: {
    timeToFirstReview: string;
    timeToMerge: string;
    reviewsPerPR: number;
  };
  timeframe: string;
}

/**
 * Calculate time difference in hours
 */
const getHoursDiff = (start: string, end: string): number => {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
};

/**
 * Group reviews by PR
 */
const groupReviewsByPR = (reviews: Review[]): Map<string, Review[]> => {
  const grouped = new Map<string, Review[]>();
  
  for (const review of reviews) {
    const key = `${review.repository}#${review.pr_number}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(review);
  }
  
  return grouped;
};

/**
 * Compute review timing for a single PR
 */
export const computePRReviewTiming = (
  pr: PullRequest,
  prReviews: Review[]
): ReviewTiming => {
  // Sort reviews by submission time
  const sortedReviews = prReviews.sort((a, b) => 
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  );
  
  // Calculate time to first review
  const timeToFirstReview = sortedReviews.length > 0 
    ? getHoursDiff(pr.created_at, sortedReviews[0].submitted_at)
    : null;
  
  // Calculate time to merge
  const timeToMerge = pr.merged_at 
    ? getHoursDiff(pr.created_at, pr.merged_at)
    : null;
  
  // Count review types
  const approvals = prReviews.filter(r => r.state === 'APPROVED').length;
  const changesRequested = prReviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
  
  return {
    prNumber: pr.number,
    repository: pr.repository,
    author: pr.author,
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    timeToFirstReview,
    timeToMerge,
    reviewCount: prReviews.length,
    approvals,
    changesRequested
  };
};

/**
 * Compute metrics for a single reviewer
 */
export const computeReviewerStats = (
  reviewer: string,
  reviews: Review[],
  prs: PullRequest[]
): ReviewerStats => {
  // Filter reviews by this reviewer
  const reviewerReviews = reviews.filter(r => r.reviewer === reviewer);
  
  // Calculate response times
  const responseTimes: number[] = [];
  for (const review of reviewerReviews) {
    const pr = prs.find(p => p.number === review.pr_number && p.repository === review.repository);
    if (pr) {
      const responseTime = getHoursDiff(pr.created_at, review.submitted_at);
      if (responseTime >= 0) { // Only include valid response times
        responseTimes.push(responseTime);
      }
    }
  }
  
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;
  
  // Calculate approval rate
  const approvals = reviewerReviews.filter(r => r.state === 'APPROVED').length;
  const approvalRate = reviewerReviews.length > 0 
    ? (approvals / reviewerReviews.length) * 100 
    : 0;
  
  // Get repositories reviewed
  const repositories = [...new Set(reviewerReviews.map(r => r.repository))];
  
  return {
    reviewer,
    reviewsGiven: reviewerReviews.length,
    avgResponseTime,
    approvalRate,
    repositories
  };
};

/**
 * Compute comprehensive review metrics
 */
export const computeReviewMetrics = (
  prs: PullRequest[],
  reviews: Review[],
  options: ContributorMetricsOptions = {}
): ReviewMetrics => {
  // Filter PRs and reviews by options
  const filteredPRs = filterPRs(prs, options);
  
  // Filter reviews to match filtered PRs
  const prKeys = new Set(filteredPRs.map(pr => `${pr.repository}#${pr.number}`));
  const filteredReviews = reviews.filter(review => 
    prKeys.has(`${review.repository}#${review.pr_number}`)
  );
  
  // Calculate basic metrics
  const totalReviews = filteredReviews.length;
  const totalPRs = filteredPRs.length;
  const avgReviewsPerPR = totalPRs > 0 ? totalReviews / totalPRs : 0;
  
  // Group reviews by PR for timing calculations
  const reviewsByPR = groupReviewsByPR(filteredReviews);
  const timings: ReviewTiming[] = [];
  
  for (const pr of filteredPRs) {
    const prKey = `${pr.repository}#${pr.number}`;
    const prReviews = reviewsByPR.get(prKey) || [];
    timings.push(computePRReviewTiming(pr, prReviews));
  }
  
  // Calculate average timing metrics
  const validFirstReviewTimes = timings
    .map(t => t.timeToFirstReview)
    .filter((time): time is number => time !== null);
  
  const avgTimeToFirstReview = validFirstReviewTimes.length > 0
    ? validFirstReviewTimes.reduce((sum, time) => sum + time, 0) / validFirstReviewTimes.length
    : 0;
  
  const validMergeTimes = timings
    .map(t => t.timeToMerge)
    .filter((time): time is number => time !== null);
  
  const avgTimeToMerge = validMergeTimes.length > 0
    ? validMergeTimes.reduce((sum, time) => sum + time, 0) / validMergeTimes.length
    : 0;
  
  // Calculate reviewer statistics
  const reviewers = [...new Set(filteredReviews.map(r => r.reviewer))];
  const reviewerStats = reviewers.map(reviewer => 
    computeReviewerStats(reviewer, filteredReviews, filteredPRs)
  );
  
  // Sort reviewers by number of reviews given
  reviewerStats.sort((a, b) => b.reviewsGiven - a.reviewsGiven);
  
  // Calculate approval rate
  const approvals = filteredReviews.filter(r => r.state === 'APPROVED').length;
  const approvalRate = totalReviews > 0 ? (approvals / totalReviews) * 100 : 0;
  
  return {
    totalReviews,
    totalPRs,
    avgReviewsPerPR,
    avgTimeToFirstReview,
    avgTimeToMerge,
    reviewerStats,
    approvalRate,
    timeframe: options.timeframe || 'all'
  };
};

/**
 * Generate review summary with insights
 */
export const generateReviewSummary = (
  prs: PullRequest[],
  reviews: Review[],
  options: ContributorMetricsOptions = {}
): ReviewSummary => {
  const metrics = computeReviewMetrics(prs, reviews, options);
  const filteredPRs = filterPRs(prs, options);
  
  // Filter reviews to match filtered PRs
  const prKeys = new Set(filteredPRs.map(pr => `${pr.repository}#${pr.number}`));
  const filteredReviews = reviews.filter(review => 
    prKeys.has(`${review.repository}#${review.pr_number}`)
  );
  
  // Group reviews by PR and compute timings
  const reviewsByPR = groupReviewsByPR(filteredReviews);
  const timings: ReviewTiming[] = [];
  
  for (const pr of filteredPRs) {
    const prKey = `${pr.repository}#${pr.number}`;
    const prReviews = reviewsByPR.get(prKey) || [];
    timings.push(computePRReviewTiming(pr, prReviews));
  }
  
  // Get fastest reviews (shortest time to first review)
  const fastestReviews = timings
    .filter(t => t.timeToFirstReview !== null)
    .sort((a, b) => a.timeToFirstReview! - b.timeToFirstReview!)
    .slice(0, 5);
  
  // Get slowest reviews (longest time to first review)
  const slowestReviews = timings
    .filter(t => t.timeToFirstReview !== null)
    .sort((a, b) => b.timeToFirstReview! - a.timeToFirstReview!)
    .slice(0, 5);
  
  // Get top reviewers
  const topReviewers = metrics.reviewerStats.slice(0, 10);
  
  return {
    fastestReviews,
    slowestReviews,
    topReviewers,
    avgMetrics: {
      timeToFirstReview: formatMergeTime(metrics.avgTimeToFirstReview),
      timeToMerge: formatMergeTime(metrics.avgTimeToMerge),
      reviewsPerPR: Math.round(metrics.avgReviewsPerPR * 10) / 10
    },
    timeframe: options.timeframe || 'all'
  };
};