/**
 * GitHub API client using Octokit with authentication and rate limiting
 */

import { Octokit } from '@octokit/rest';
import { getGitHubToken, validateGitHubToken } from './auth.js';
import type { DigestConfig, RawPR, RawReview, RawPRFile } from '../../types/index.js';

export type GitHubClient = {
  /**
   * Underlying Octokit instance for advanced usage
   */
  octokit: Octokit;
  
  /**
   * Test connection and authentication
   */
  testConnection(): Promise<{ success: boolean; user?: string; error?: string }>;
  
  /**
   * List PRs for a repository
   */
  listPRs(owner: string, repo: string, options?: {
    state?: 'open' | 'closed' | 'all';
    since?: string;
    per_page?: number;
    page?: number;
  }): Promise<RawPR[]>;
  
  /**
   * Get detailed PR data
   */
  getPR(owner: string, repo: string, prNumber: number): Promise<RawPR>;
  
  /**
   * Get PR reviews
   */
  getPRReviews(owner: string, repo: string, prNumber: number): Promise<RawReview[]>;
  
  /**
   * Get PR files
   */
  getPRFiles(owner: string, repo: string, prNumber: number): Promise<RawPRFile[]>;
  
  /**
   * Get repository information
   */
  getRepository(owner: string, repo: string): Promise<{
    name: string;
    owner: { login: string };
    full_name: string;
    private: boolean;
    default_branch: string;
  }>;
};

/**
 * Create GitHub client with authentication and rate limiting
 */
export const createGitHubClient = async (config?: DigestConfig): Promise<GitHubClient> => {
  // Get and validate token
  const token = await getGitHubToken(config);
  const isValid = await validateGitHubToken(token);
  
  if (!isValid) {
    throw new Error('Invalid GitHub token. Please check your authentication.');
  }
  
  // Create Octokit instance with rate limiting
  const octokit = new Octokit({
    auth: token,
    baseUrl: config?.github?.baseUrl || 'https://api.github.com',
    throttle: {
      onRateLimit: (retryAfter: number) => {
        console.warn(`GitHub rate limit exceeded. Retrying after ${retryAfter}s...`);
        return true; // Automatically retry
      },
      onSecondaryRateLimit: (retryAfter: number) => {
        console.warn(`GitHub secondary rate limit hit. Retrying after ${retryAfter}s...`);
        return true; // Automatically retry
      }
    },
    userAgent: 'digest-cli'
  });
  
  return {
    octokit,
    
    async testConnection() {
      try {
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return { success: true, user: user.login };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    
    async listPRs(owner, repo, options = {}) {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: options.state || 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: options.per_page || 100,
        page: options.page || 1
      });
      
      return data.map(transformPR);
    },
    
    async getPR(owner, repo, prNumber) {
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      });
      
      return transformPR(data);
    },
    
    async getPRReviews(owner, repo, prNumber) {
      const { data } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
      });
      
      return data.map(transformReview);
    },
    
    async getPRFiles(owner, repo, prNumber) {
      const { data } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber
      });
      
      return data.map(transformFile);
    },
    
    async getRepository(owner, repo) {
      const { data } = await octokit.rest.repos.get({
        owner,
        repo
      });
      
      return {
        name: data.name,
        owner: { login: data.owner.login },
        full_name: data.full_name,
        private: data.private,
        default_branch: data.default_branch
      };
    }
  };
};

/**
 * Transform GitHub API PR response to our internal format
 */
function transformPR(pr: any): RawPR {
  return {
    number: pr.number,
    title: pr.title,
    user: pr.user,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    merged_at: pr.merged_at,
    state: pr.state,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changed_files: pr.changed_files || 0,
    base: { ref: pr.base.ref },
    head: { ref: pr.head.ref }
  };
}

/**
 * Transform GitHub API review response to our internal format
 */
function transformReview(review: any): RawReview {
  return {
    id: review.id,
    user: review.user,
    state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
    submitted_at: review.submitted_at,
    body: review.body
  };
}

/**
 * Transform GitHub API file response to our internal format
 */
function transformFile(file: any): RawPRFile {
  return {
    filename: file.filename,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status as 'added' | 'modified' | 'removed' | 'renamed',
    previous_filename: file.previous_filename
  };
}