import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { getGitHubToken, validateGitHubToken, getGitHubUser } from './auth.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn()
}));

// Mock fetch
global.fetch = vi.fn();

describe('GitHub Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN environment variable first', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      
      const token = await getGitHubToken();
      
      expect(token).toBe('env-token');
    });

    it('should return GH_TOKEN environment variable second', async () => {
      process.env.GH_TOKEN = 'gh-env-token';
      
      const token = await getGitHubToken();
      
      expect(token).toBe('gh-env-token');
    });

    it('should return config token third', async () => {
      const config = {
        github: { token: 'config-token' }
      };
      
      const token = await getGitHubToken(config);
      
      expect(token).toBe('config-token');
    });

    it('should use gh CLI token as fallback', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: 'gh-cli-token',
        stderr: '',
        exitCode: 0,
        command: 'gh auth token',
        escapedCommand: 'gh auth token',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false
      } as any);
      
      const token = await getGitHubToken();
      
      expect(token).toBe('gh-cli-token');
      expect(execa).toHaveBeenCalledWith('gh', ['auth', 'token']);
    });

    it('should throw error when no token found', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('gh not found'));
      
      await expect(getGitHubToken()).rejects.toThrow(
        'GitHub token not found. Please:'
      );
    });
  });

  describe('validateGitHubToken', () => {
    it('should return true for valid token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200
      } as Response);
      
      const isValid = await validateGitHubToken('valid-token');
      
      expect(isValid).toBe(true);
      expect(fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          'Authorization': 'token valid-token',
          'User-Agent': 'digest-cli'
        }
      });
    });

    it('should return false for invalid token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 401
      } as Response);
      
      const isValid = await validateGitHubToken('invalid-token');
      
      expect(isValid).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      
      const isValid = await validateGitHubToken('token');
      
      expect(isValid).toBe(false);
    });
  });

  describe('getGitHubUser', () => {
    it('should return username for valid token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ login: 'testuser' })
      } as Response);
      
      const user = await getGitHubUser('valid-token');
      
      expect(user).toBe('testuser');
    });

    it('should return null for invalid token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 401
      } as Response);
      
      const user = await getGitHubUser('invalid-token');
      
      expect(user).toBe(null);
    });

    it('should return null on error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      
      const user = await getGitHubUser('token');
      
      expect(user).toBe(null);
    });
  });
});