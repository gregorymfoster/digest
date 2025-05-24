import type { StorageInterface } from '../storage/index.js';
import {
  generateContributorSummary,
  generateReviewSummary,
  type ContributorSummary,
  type ReviewSummary,
  type ContributorMetricsOptions
} from './index.js';

export interface AnalyticsResult {
  contributors: ContributorSummary;
  reviews: ReviewSummary;
  overview: {
    totalPRs: number;
    totalContributors: number;
    totalReviews: number;
    timeframe: string;
    repositories: string[];
  };
  generatedAt: string;
}

export interface AnalyticsPipelineOptions extends ContributorMetricsOptions {
  repositories?: string[];
}

/**
 * Main analytics pipeline that computes all metrics
 */
export const computeAnalytics = async (
  storage: StorageInterface,
  options: AnalyticsPipelineOptions = {}
): Promise<AnalyticsResult> => {
  // Load data from storage
  const allPRs = storage.getPRs();
  const allReviews = storage.getReviews();
  
  // Filter by repositories if specified
  let prs = allPRs;
  let reviews = allReviews;
  
  if (options.repositories && options.repositories.length > 0) {
    prs = allPRs.filter(pr => options.repositories!.includes(pr.repository));
    const prKeys = new Set(prs.map(pr => `${pr.repository}#${pr.number}`));
    reviews = allReviews.filter(review => 
      prKeys.has(`${review.repository}#${review.pr_number}`)
    );
  }
  
  // Generate analytics
  const contributors = generateContributorSummary(prs, reviews, options);
  const reviewMetrics = generateReviewSummary(prs, reviews, options);
  
  // Generate overview
  const repositories = [...new Set(prs.map(pr => pr.repository))];
  const overview = {
    totalPRs: prs.length,
    totalContributors: contributors.totalContributors,
    totalReviews: reviews.length,
    timeframe: options.timeframe || 'all',
    repositories
  };
  
  return {
    contributors,
    reviews: reviewMetrics,
    overview,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Get contributor analytics only
 */
export const getContributorAnalytics = async (
  storage: StorageInterface,
  options: AnalyticsPipelineOptions = {}
): Promise<ContributorSummary> => {
  const prs = storage.getPRs();
  const reviews = storage.getReviews();
  
  return generateContributorSummary(prs, reviews, options);
};

/**
 * Get review analytics only
 */
export const getReviewAnalytics = async (
  storage: StorageInterface,
  options: AnalyticsPipelineOptions = {}
): Promise<ReviewSummary> => {
  const prs = storage.getPRs();
  const reviews = storage.getReviews();
  
  return generateReviewSummary(prs, reviews, options);
};

/**
 * Get analytics for a specific repository
 */
export const getRepositoryAnalytics = async (
  storage: StorageInterface,
  repository: string,
  options: Omit<AnalyticsPipelineOptions, 'repositories'> = {}
): Promise<AnalyticsResult> => {
  return computeAnalytics(storage, {
    ...options,
    repositories: [repository]
  });
};