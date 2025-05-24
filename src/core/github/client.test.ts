import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Octokit } from '@octokit/rest';
import { createGitHubClient } from './client.js';
import * as auth from './auth.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    rest: {
      users: {
        getAuthenticated: vi.fn()
      },
      pulls: {
        list: vi.fn(),
        get: vi.fn(),
        listReviews: vi.fn(),
        listFiles: vi.fn()
      },
      repos: {
        get: vi.fn()
      }
    }
  }))
}));

// Mock auth module
vi.mock('./auth.js', () => ({
  getGitHubToken: vi.fn(),
  validateGitHubToken: vi.fn()
}));

describe('GitHub Client', () => {
  const mockOctokit = {
    rest: {
      users: {
        getAuthenticated: vi.fn()
      },
      pulls: {
        list: vi.fn(),
        get: vi.fn(),
        listReviews: vi.fn(),
        listFiles: vi.fn()
      },
      repos: {
        get: vi.fn()
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Octokit).mockReturnValue(mockOctokit as any);
    vi.mocked(auth.getGitHubToken).mockResolvedValue('test-token');
    vi.mocked(auth.validateGitHubToken).mockResolvedValue(true);
  });

  describe('createGitHubClient', () => {
    it('should create client with valid token', async () => {
      const client = await createGitHubClient();
      
      expect(client).toBeDefined();
      expect(auth.getGitHubToken).toHaveBeenCalled();
      expect(auth.validateGitHubToken).toHaveBeenCalledWith('test-token');
    });

    it('should throw error with invalid token', async () => {
      vi.mocked(auth.validateGitHubToken).mockResolvedValue(false);
      
      await expect(createGitHubClient()).rejects.toThrow(
        'Invalid GitHub token. Please check your authentication.'
      );
    });

    it('should configure Octokit with custom baseUrl', async () => {
      const config = {
        github: { baseUrl: 'https://github.enterprise.com/api/v3' }
      };
      
      await createGitHubClient(config);
      
      expect(Octokit).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://github.enterprise.com/api/v3'
        })
      );
    });
  });

  describe('client methods', () => {
    let client: any;

    beforeEach(async () => {
      client = await createGitHubClient();
    });

    describe('testConnection', () => {
      it('should return success with user info', async () => {
        mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
          data: { login: 'testuser' }
        });
        
        const result = await client.testConnection();
        
        expect(result).toEqual({ success: true, user: 'testuser' });
      });

      it('should return error on failure', async () => {
        mockOctokit.rest.users.getAuthenticated.mockRejectedValue(
          new Error('Unauthorized')
        );
        
        const result = await client.testConnection();
        
        expect(result).toEqual({ success: false, error: 'Unauthorized' });
      });
    });

    describe('listPRs', () => {
      it('should list PRs with default options', async () => {
        const mockPRs = [{
          number: 1,
          title: 'Test PR',
          user: { login: 'author' },
          created_at: '2024-01-01T00:00:00Z',
          merged_at: '2024-01-02T00:00:00Z',
          state: 'closed',
          additions: 10,
          deletions: 5,
          changed_files: 2,
          base: { ref: 'main' },
          head: { ref: 'feature' }
        }];
        
        mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });
        
        const result = await client.listPRs('owner', 'repo');
        
        expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: 100,
          page: 1
        });
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          number: 1,
          title: 'Test PR',
          state: 'closed'
        });
      });

      it('should list PRs with custom options', async () => {
        mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
        
        await client.listPRs('owner', 'repo', {
          state: 'open',
          per_page: 50,
          page: 2
        });
        
        expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          state: 'open',
          sort: 'updated',
          direction: 'desc',
          per_page: 50,
          page: 2
        });
      });
    });

    describe('getPR', () => {
      it('should get single PR', async () => {
        const mockPR = {
          number: 1,
          title: 'Test PR',
          user: { login: 'author' },
          created_at: '2024-01-01T00:00:00Z',
          merged_at: null,
          state: 'open',
          additions: 10,
          deletions: 5,
          changed_files: 2,
          base: { ref: 'main' },
          head: { ref: 'feature' }
        };
        
        mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });
        
        const result = await client.getPR('owner', 'repo', 1);
        
        expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          pull_number: 1
        });
        
        expect(result).toMatchObject({
          number: 1,
          title: 'Test PR',
          state: 'open'
        });
      });
    });

    describe('getPRReviews', () => {
      it('should get PR reviews', async () => {
        const mockReviews = [{
          id: 1,
          user: { login: 'reviewer' },
          state: 'APPROVED',
          submitted_at: '2024-01-01T00:00:00Z',
          body: 'LGTM'
        }];
        
        mockOctokit.rest.pulls.listReviews.mockResolvedValue({ data: mockReviews });
        
        const result = await client.getPRReviews('owner', 'repo', 1);
        
        expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          pull_number: 1
        });
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: 1,
          state: 'APPROVED',
          body: 'LGTM'
        });
      });
    });

    describe('getPRFiles', () => {
      it('should get PR files', async () => {
        const mockFiles = [{
          filename: 'src/test.ts',
          additions: 10,
          deletions: 5,
          status: 'modified'
        }];
        
        mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockFiles });
        
        const result = await client.getPRFiles('owner', 'repo', 1);
        
        expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          pull_number: 1
        });
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          filename: 'src/test.ts',
          additions: 10,
          deletions: 5,
          status: 'modified'
        });
      });
    });

    describe('getRepository', () => {
      it('should get repository info', async () => {
        const mockRepo = {
          name: 'test-repo',
          owner: { login: 'owner' },
          full_name: 'owner/test-repo',
          private: false,
          default_branch: 'main'
        };
        
        mockOctokit.rest.repos.get.mockResolvedValue({ data: mockRepo });
        
        const result = await client.getRepository('owner', 'test-repo');
        
        expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'test-repo'
        });
        
        expect(result).toEqual(mockRepo);
      });
    });
  });
});