import type { StorageInterface } from '../storage/index.js';

export interface SyncCheckpoint {
  repository: string;
  lastSyncedPRNumber: number; // Highest PR number we've successfully synced
  lastSyncAt: string; // When we last synced
  totalPRsSynced: number; // Count of PRs synced in this repository
}

export class IncrementalSyncManager {
  constructor(private storage: StorageInterface) {}

  /**
   * Get the last synced PR number for a repository
   */
  getLastSyncedPRNumber(repository: string): number {
    const existingPRs = this.storage.getPRs({ repository });
    if (existingPRs.length === 0) {
      return 0; // No PRs synced yet
    }

    // Find the highest PR number we've synced
    return Math.max(...existingPRs.map(pr => pr.number));
  }

  /**
   * Get the last sync timestamp for a repository
   */
  getLastSyncTime(repository: string): string | null {
    const existingPRs = this.storage.getPRs({ repository });
    if (existingPRs.length === 0) {
      return null;
    }

    // Find the most recent sync time
    const mostRecent = existingPRs
      .filter(pr => pr.synced_at)
      .sort((a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime())[0];

    return mostRecent?.synced_at || null;
  }

  /**
   * Determine what PRs need to be synced
   * Returns API parameters for fetching only what we need
   */
  getSyncParameters(repository: string): {
    // Fetch new PRs (number > lastSyncedPRNumber)
    newPRsParams: {
      state: 'all';
      sort: 'created';
      direction: 'desc';
      since?: string;
    };
    // Fetch updated open PRs (updated since last sync)
    updatedOpenPRsParams?: {
      state: 'open';
      sort: 'updated'; 
      direction: 'desc';
      since: string;
    };
    lastSyncedPRNumber: number;
    lastSyncTime: string | null;
  } {
    const lastSyncedPRNumber = this.getLastSyncedPRNumber(repository);
    const lastSyncTime = this.getLastSyncTime(repository);

    const result = {
      newPRsParams: {
        state: 'all' as const,
        sort: 'created' as const,
        direction: 'desc' as const,
        since: lastSyncTime || undefined
      },
      lastSyncedPRNumber,
      lastSyncTime
    };

    // If we have a last sync time, also check for updated open PRs
    if (lastSyncTime) {
      return {
        ...result,
        updatedOpenPRsParams: {
          state: 'open' as const,
          sort: 'updated' as const,
          direction: 'desc' as const,
          since: lastSyncTime
        }
      };
    }

    return result;
  }

  /**
   * Check if a PR should be processed based on incremental sync logic
   */
  shouldProcessPR(repository: string, prNumber: number, prState: string, prUpdatedAt: string): {
    shouldProcess: boolean;
    reason: 'new-pr' | 'updated-open-pr' | 'already-synced' | 'immutable-closed';
  } {
    const lastSyncedPRNumber = this.getLastSyncedPRNumber(repository);
    const lastSyncTime = this.getLastSyncTime(repository);

    // New PR (number > last synced)
    if (prNumber > lastSyncedPRNumber) {
      return { shouldProcess: true, reason: 'new-pr' };
    }

    // Existing PR
    if (prNumber <= lastSyncedPRNumber) {
      // If it's closed/merged, we don't need to re-sync it
      if (prState === 'closed' || prState === 'merged') {
        return { shouldProcess: false, reason: 'immutable-closed' };
      }

      // If it's open and updated since our last sync, re-sync it
      if (prState === 'open' && lastSyncTime && new Date(prUpdatedAt) > new Date(lastSyncTime)) {
        return { shouldProcess: true, reason: 'updated-open-pr' };
      }

      // Otherwise, it's already synced and hasn't changed
      return { shouldProcess: false, reason: 'already-synced' };
    }

    return { shouldProcess: false, reason: 'already-synced' };
  }

  /**
   * Get sync statistics for a repository
   */
  getSyncStats(repository: string): {
    totalPRs: number;
    lastSyncedPRNumber: number;
    lastSyncTime: string | null;
    isFirstSync: boolean;
  } {
    const totalPRs = this.storage.getPRs({ repository }).length;
    const lastSyncedPRNumber = this.getLastSyncedPRNumber(repository);
    const lastSyncTime = this.getLastSyncTime(repository);

    return {
      totalPRs,
      lastSyncedPRNumber,
      lastSyncTime,
      isFirstSync: totalPRs === 0
    };
  }

  /**
   * Save a checkpoint after successful batch processing
   */
  saveCheckpoint(repository: string, highestPRNumberProcessed: number): void {
    // Update the synced_at timestamp for all PRs up to this number
    const now = new Date().toISOString();
    
    // In a real implementation, we might update the database
    // For now, this is handled by the individual PR processing
    console.log(`Checkpoint: Repository ${repository} synced up to PR #${highestPRNumberProcessed} at ${now}`);
  }

  /**
   * Estimate work remaining for progress display
   */
  estimateWorkRemaining(repository: string, totalPRsFound: number, currentPRNumber: number): {
    prsProcessed: number;
    prsRemaining: number;
    progressPercentage: number;
  } {
    const lastSyncedPRNumber = this.getLastSyncedPRNumber(repository);
    
    // Count how many PRs we've processed in this session
    const prsProcessed = Math.max(0, currentPRNumber - lastSyncedPRNumber);
    const prsRemaining = Math.max(0, totalPRsFound - prsProcessed);
    const progressPercentage = totalPRsFound > 0 ? Math.round((prsProcessed / totalPRsFound) * 100) : 0;

    return {
      prsProcessed,
      prsRemaining, 
      progressPercentage
    };
  }
}