import { WorkspaceManager } from '../workspace/index.js';
import { createGitHubClient } from '../github/client.js';
import { SqliteStore } from '../storage/index.js';
import { PRSyncService } from './pr_sync.js';
import type { PRSyncResult, PRSyncOptions } from './pr_sync.js';
import type { SyncProgress } from '../../types/index.js';
import type { TrackedRepository } from '../../types/index.js';

export interface SyncAllOptions {
  force?: boolean;
  onProgress?: (repository: string, progress: SyncProgress) => void;
  onComplete?: (repository: string, result: PRSyncResult) => void;
  onError?: (repository: string, error: Error) => void;
}

export interface SyncAllResult {
  totalRepositories: number;
  successfulSyncs: number;
  failedSyncs: number;
  results: Array<{
    repository: string;
    success: boolean;
    result?: PRSyncResult;
    error?: string;
  }>;
}

export class SyncOrchestrator {
  constructor(
    private workspace: WorkspaceManager = new WorkspaceManager()
  ) {}

  /**
   * Sync all active repositories in the workspace
   */
  async syncAll(options: SyncAllOptions = {}): Promise<SyncAllResult> {
    const { force = false, onProgress, onComplete, onError } = options;

    // Check workspace initialization
    if (!this.workspace.isInitialized()) {
      throw new Error('Workspace not initialized. Run "digest init" first.');
    }

    // Get active repositories
    const activeRepos = await this.workspace.getActiveRepositories();
    
    if (activeRepos.length === 0) {
      throw new Error('No repositories are being tracked. Add repositories with "digest add <repo>".');
    }

    // Initialize storage and GitHub client
    const config = await this.workspace.load();
    const storage = new SqliteStore(config.database?.path || './.digest/digest.db');
    const githubClient = await createGitHubClient(config);
    const syncService = new PRSyncService(githubClient.octokit, storage);

    const result: SyncAllResult = {
      totalRepositories: activeRepos.length,
      successfulSyncs: 0,
      failedSyncs: 0,
      results: []
    };

    try {
      // Sync each repository
      for (const repo of activeRepos) {
        try {
          const syncResult = await this.syncRepository(
            syncService,
            repo,
            force,
            (progress) => onProgress?.(repo.name, progress)
          );

          result.successfulSyncs++;
          result.results.push({
            repository: repo.name,
            success: true,
            result: syncResult
          });

          // Update workspace with sync status
          await this.workspace.updateRepositorySync(
            repo.name,
            syncResult.lastSyncAt,
            syncResult.errors.map(e => ({
              timestamp: new Date().toISOString(),
              error: e.error,
              type: 'api' as const
            }))
          );

          onComplete?.(repo.name, syncResult);

        } catch (error) {
          result.failedSyncs++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          result.results.push({
            repository: repo.name,
            success: false,
            error: errorMessage
          });

          // Update workspace with error
          await this.workspace.updateRepositorySync(
            repo.name,
            new Date().toISOString(),
            [{
              timestamp: new Date().toISOString(),
              error: errorMessage,
              type: 'unknown' as const
            }]
          );

          onError?.(repo.name, error as Error);
        }
      }

    } finally {
      storage.close();
    }

    return result;
  }

  /**
   * Sync a specific repository
   */
  async syncSingleRepository(
    repository: string,
    options: { force?: boolean; onProgress?: (progress: SyncProgress) => void } = {}
  ): Promise<PRSyncResult> {
    // Check workspace initialization
    if (!this.workspace.isInitialized()) {
      throw new Error('Workspace not initialized. Run "digest init" first.');
    }

    // Check if repository is tracked
    const trackedRepos = await this.workspace.getTrackedRepositories();
    const trackedRepo = trackedRepos.find(r => r.name === repository);
    
    if (!trackedRepo) {
      throw new Error(`Repository ${repository} is not being tracked. Add it with "digest add ${repository}".`);
    }

    if (!trackedRepo.active) {
      throw new Error(`Repository ${repository} is disabled. Enable it first.`);
    }

    // Initialize storage and GitHub client
    const config = await this.workspace.load();
    const storage = new SqliteStore(config.database?.path || './.digest/digest.db');
    const githubClient = await createGitHubClient(config);
    const syncService = new PRSyncService(githubClient.octokit, storage);

    try {
      const result = await this.syncRepository(
        syncService,
        trackedRepo,
        options.force || false,
        options.onProgress
      );

      // Update workspace with sync status
      await this.workspace.updateRepositorySync(
        repository,
        result.lastSyncAt,
        result.errors.map(e => ({
          timestamp: new Date().toISOString(),
          error: e.error,
          type: 'api' as const
        }))
      );

      return result;

    } finally {
      storage.close();
    }
  }

  private async syncRepository(
    syncService: PRSyncService,
    repo: TrackedRepository,
    force: boolean,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<PRSyncResult> {
    const syncOptions: PRSyncOptions = {
      repository: repo.name,
      force,
      onProgress
    };

    // Use syncSince for initial sync, or rely on incremental sync
    if (repo.syncSince && (!repo.lastSyncAt || force)) {
      syncOptions.since = repo.syncSince;
    }

    return syncService.syncRepository(syncOptions);
  }
}