/**
 * GitHub authentication utilities
 */

import { execa } from 'execa';
import type { DigestConfig } from '../../types/index.js';

/**
 * Get GitHub token using authentication hierarchy
 * 1. Environment variable (highest priority)
 * 2. Config file token
 * 3. gh CLI token (fallback)
 */
export const getGitHubToken = async (config?: DigestConfig): Promise<string> => {
  // 1. Environment variable (highest priority)
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }
  
  // 2. Config file token
  if (config?.github?.token) {
    return config.github.token;
  }
  
  // 3. gh CLI token (fallback)
  try {
    const result = await execa('gh', ['auth', 'token']);
    return result.stdout.trim();
  } catch {
    throw new Error(
      'GitHub token not found. Please:\n' +
      '  1. Set GITHUB_TOKEN environment variable, or\n' +
      '  2. Run "gh auth login", or\n' +
      '  3. Configure token in digest config file'
    );
  }
};

/**
 * Validate GitHub token by making a test API call
 */
export const validateGitHubToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'digest-cli'
      }
    });
    
    return response.status === 200;
  } catch {
    return false;
  }
};

/**
 * Get GitHub username for the authenticated token
 */
export const getGitHubUser = async (token: string): Promise<string | null> => {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'digest-cli'
      }
    });
    
    if (response.status === 200) {
      const user = await response.json();
      return user.login;
    }
    
    return null;
  } catch {
    return null;
  }
};