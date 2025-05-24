import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { PRSyncService } from './pr_sync.js';
import { SqliteStore } from '../storage/sqlite_store.js';
import type { Octokit } from '@octokit/rest';
import type { RawPR, RawReview, RawPRFile } from '../../types/index.js';

// Mock Octokit
const mockOctokit = {
  rest: {
    pulls: {
      list: vi.fn(),
      listFiles: vi.fn(),
      listReviews: vi.fn()
    }
  }
} as unknown as Octokit;

describe('PRSyncService', () => {
  let syncService: PRSyncService;
  let storage: SqliteStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `digest-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    storage = new SqliteStore(dbPath);
    syncService = new PRSyncService(mockOctokit, storage);
    vi.clearAllMocks();
  });

  afterEach(() => {
    storage.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('syncRepository', () => {
    const samplePR: RawPR = {
      number: 123,
      title: 'Add new feature',
      user: { login: 'johndoe' },
      created_at: '2024-01-01T10:00:00Z',
      updated_at: '2024-01-01T11:30:00Z',
      merged_at: '2024-01-01T12:00:00Z',
      state: 'closed',
      additions: 100,
      deletions: 50,
      changed_files: 5,
      base: { ref: 'main' },
      head: { ref: 'feature-branch' }
    };

    const sampleFiles: RawPRFile[] = [
      {
        filename: 'src/feature.ts',
        additions: 80,
        deletions: 20,
        status: 'modified'
      },
      {
        filename: 'src/feature.test.ts',
        additions: 20,
        deletions: 5,
        status: 'added'
      }
    ];

    const sampleReviews: RawReview[] = [
      {
        id: 1,
        user: { login: 'reviewer1' },
        state: 'APPROVED',
        submitted_at: '2024-01-01T11:00:00Z',
        body: 'LGTM'
      },
      {
        id: 2,
        user: { login: 'reviewer2' },
        state: 'CHANGES_REQUESTED',
        submitted_at: '2024-01-01T10:30:00Z',
        body: 'Please fix the tests'
      }
    ];

    it('should sync new repository successfully', async () => {
      // Mock API responses
      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [samplePR],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: sampleFiles
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: sampleReviews
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.totalPRs).toBe(1);
      expect(result.newPRs).toBe(1);
      expect(result.updatedPRs).toBe(0);
      expect(result.newReviews).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify PR was stored
      const storedPRs = storage.getPRs({ repository: 'owner/repo' });
      expect(storedPRs).toHaveLength(1);
      expect(storedPRs[0]).toMatchObject({
        number: 123,
        repository: 'owner/repo',
        author: 'johndoe',
        title: 'Add new feature',
        has_tests: true // Should detect tests
      });

      // Verify reviews were stored
      const storedReviews = storage.getReviews({ repository: 'owner/repo' });
      expect(storedReviews).toHaveLength(2);
      expect(storedReviews).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pr_number: 123,
            reviewer: 'reviewer1',
            state: 'APPROVED'
          }),
          expect.objectContaining({
            pr_number: 123,
            reviewer: 'reviewer2',
            state: 'CHANGES_REQUESTED'
          })
        ])
      );
    });

    it('should handle incremental sync', async () => {
      // First sync - add initial PR
      const existingPR = {
        number: 100,
        repository: 'owner/repo',
        author: 'olduser',
        title: 'Old PR',
        created_at: '2023-12-01T10:00:00Z',
        merged_at: '2023-12-01T11:00:00Z',
        additions: 50,
        deletions: 20,
        changed_files: 3,
        has_tests: false,
        synced_at: '2023-12-01T12:00:00Z'
      };
      storage.addPR(existingPR);

      // Mock API to return only new PR (simulating incremental sync)
      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [samplePR],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: sampleFiles
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: sampleReviews
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.newPRs).toBe(1);
      expect(result.updatedPRs).toBe(0);

      // Should have both old and new PRs
      const allPRs = storage.getPRs({ repository: 'owner/repo' });
      expect(allPRs).toHaveLength(2);

      // Verify API was called with since parameter based on existing data
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          since: '2023-12-01T12:00:00Z' // Should use most recent sync time
        })
      );
    });

    it('should force full sync when requested', async () => {
      // Add existing PR
      const existingPR = {
        number: 100,
        repository: 'owner/repo',
        author: 'olduser',
        title: 'Old PR',
        created_at: '2023-12-01T10:00:00Z',
        merged_at: '2023-12-01T11:00:00Z',
        additions: 50,
        deletions: 20,
        changed_files: 3,
        has_tests: false,
        synced_at: '2023-12-01T12:00:00Z'
      };
      storage.addPR(existingPR);

      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [samplePR],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: sampleFiles
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: sampleReviews
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo',
        force: true,
        since: '2024-01-01T00:00:00Z'
      });

      expect(result.newPRs).toBe(1);

      // Should NOT use incremental sync point when force=true
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          since: '2024-01-01T00:00:00Z' // Should use provided since, not existing data
        })
      );
    });

    it('should detect tests correctly', async () => {
      const testCases = [
        {
          files: [{ filename: 'src/component.test.js', additions: 10, deletions: 0, status: 'added' as const }],
          expectedTests: true,
          description: 'should detect .test. files'
        },
        {
          files: [{ filename: 'src/component.spec.ts', additions: 10, deletions: 0, status: 'added' as const }],
          expectedTests: true,
          description: 'should detect .spec. files'
        },
        {
          files: [{ filename: 'tests/unit.js', additions: 10, deletions: 0, status: 'added' as const }],
          expectedTests: true,
          description: 'should detect /tests/ directory'
        },
        {
          files: [{ filename: '__tests__/component.js', additions: 10, deletions: 0, status: 'added' as const }],
          expectedTests: true,
          description: 'should detect __tests__ directory'
        },
        {
          files: [{ filename: 'src/component.js', additions: 10, deletions: 0, status: 'added' as const }],
          expectedTests: false,
          description: 'should not detect tests in regular files'
        }
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const uniqueRepo = `test/repo${i}`;
        const prWithFiles = { ...samplePR, number: 100 + i }; // Unique PR number

        vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
          data: [prWithFiles],
          headers: {
            'x-ratelimit-remaining': '5000',
            'x-ratelimit-reset': '1640995200'
          }
        } as any);

        vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
          data: testCase.files
        } as any);

        vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
          data: []
        } as any);

        await syncService.syncRepository({
          repository: uniqueRepo
        });

        const storedPRs = storage.getPRs({ repository: uniqueRepo });
        const pr = storedPRs.find(p => p.number === prWithFiles.number);
        expect(pr?.has_tests, testCase.description).toBe(testCase.expectedTests);

        vi.clearAllMocks();
      }
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(mockOctokit.rest.pulls.list).mockRejectedValue(new Error('API Error'));

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.totalPRs).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Sync failed: API Error');
    });

    it('should handle individual PR processing errors', async () => {
      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [samplePR],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      // Simulate file fetch error
      vi.mocked(mockOctokit.rest.pulls.listFiles).mockRejectedValue(new Error('File fetch error'));
      
      // Reviews should still work
      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: sampleReviews
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.totalPRs).toBe(1);
      expect(result.newPRs).toBe(1);
      // Should still store PR even if files failed
      const storedPRs = storage.getPRs({ repository: 'owner/repo' });
      expect(storedPRs).toHaveLength(1);
      expect(storedPRs[0].has_tests).toBe(false); // No tests detected due to file fetch error
    });

    it('should track sync progress', async () => {
      const progressCalls: any[] = [];
      const onProgress = vi.fn((progress) => progressCalls.push(progress));

      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [samplePR],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: sampleFiles
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: sampleReviews
      } as any);

      await syncService.syncRepository({
        repository: 'owner/repo',
        onProgress
      });

      expect(onProgress).toHaveBeenCalled();
      expect(progressCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'fetching' }),
          expect.objectContaining({ phase: 'processing' }),
          expect.objectContaining({ phase: 'storing' }),
          expect.objectContaining({ phase: 'complete' })
        ])
      );
    });

    it('should handle pagination correctly', async () => {
      const prs1 = Array.from({ length: 100 }, (_, i) => ({
        ...samplePR,
        number: i + 1
      }));
      
      const prs2 = Array.from({ length: 50 }, (_, i) => ({
        ...samplePR,
        number: i + 101
      }));

      vi.mocked(mockOctokit.rest.pulls.list)
        .mockResolvedValueOnce({ 
          data: prs1,
          headers: {
            'x-ratelimit-remaining': '5000',
            'x-ratelimit-reset': '1640995200'
          }
        } as any)
        .mockResolvedValueOnce({ 
          data: prs2,
          headers: {
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': '1640995200'
          }
        } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: []
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: []
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.totalPRs).toBe(150);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledTimes(2);
      
      // First call should be page 1
      expect(mockOctokit.rest.pulls.list).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({ page: 1 })
      );
      
      // Second call should be page 2
      expect(mockOctokit.rest.pulls.list).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ page: 2 })
      );
    });
  });

  describe('error handling', () => {
    it('should validate repository format', async () => {
      await expect(
        syncService.syncRepository({ repository: 'invalid-repo-format' })
      ).rejects.toThrow('Invalid repository format');
    });

    it('should handle missing user data', async () => {
      const prWithoutUser = { 
        number: 123,
        title: 'PR without user',
        user: null,
        created_at: '2024-01-01T10:00:00Z',
        merged_at: null,
        state: 'open' as const,
        additions: 0,
        deletions: 0,
        changed_files: 0,
        base: { ref: 'main' },
        head: { ref: 'feature' }
      };

      vi.mocked(mockOctokit.rest.pulls.list).mockResolvedValue({
        data: [prWithoutUser],
        headers: {
          'x-ratelimit-remaining': '5000',
          'x-ratelimit-reset': '1640995200'
        }
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listFiles).mockResolvedValue({
        data: []
      } as any);

      vi.mocked(mockOctokit.rest.pulls.listReviews).mockResolvedValue({
        data: []
      } as any);

      const result = await syncService.syncRepository({
        repository: 'owner/repo'
      });

      expect(result.newPRs).toBe(1);
      
      const storedPRs = storage.getPRs({ repository: 'owner/repo' });
      expect(storedPRs[0].author).toBe('unknown');
    });
  });
});
