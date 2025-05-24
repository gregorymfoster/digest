import type { Octokit } from '@octokit/rest';
import type { PullRequest, Review, StorageInterface } from '../storage/index.js';
import type { RawPR, RawReview, RawPRFile, SyncProgress } from '../../types/index.js';
import { IncrementalSyncManager } from './incremental_sync.js';

export interface PRSyncOptions {
  repository: string;
  since?: string; // ISO date or GitHub-style date
  force?: boolean; // Ignore last sync point
  onProgress?: (progress: SyncProgress) => void;
}

export interface PRSyncResult {
  totalPRs: number;
  newPRs: number;
  updatedPRs: number;
  newReviews: number;
  errors: Array<{ pr: number; error: string }>;
  lastSyncAt: string;
}

export class PRSyncService {
  private incrementalSyncManager: IncrementalSyncManager;

  constructor(
    private octokit: Octokit,
    private storage: StorageInterface
  ) {
    this.incrementalSyncManager = new IncrementalSyncManager(storage);
  }

  async syncRepository(options: PRSyncOptions): Promise<PRSyncResult> {
    const { repository, since, force, onProgress } = options;
    const { owner, repo } = this.parseRepository(repository);
    const syncStartTime = Date.now();
    
    const result: PRSyncResult = {
      totalPRs: 0,
      newPRs: 0,
      updatedPRs: 0,
      newReviews: 0,
      errors: [],
      lastSyncAt: new Date().toISOString()
    };

    try {
      // Get current sync state and determine what needs to be synced
      const syncStats = this.incrementalSyncManager.getSyncStats(repository);
      
      onProgress?.({
        phase: 'fetching',
        totalPRs: 0,
        processedPRs: 0,
        errors: []
      });

      console.log(`📊 Incremental sync for ${repository}:`);
      console.log(`  Last synced PR: #${syncStats.lastSyncedPRNumber}`);
      console.log(`  Total PRs in DB: ${syncStats.totalPRs}`);
      console.log(`  ${syncStats.isFirstSync ? 'First sync' : 'Incremental sync'}`);

      // Fetch and process PRs incrementally with immediate storage
      const { newPRs, updatedPRs } = await this.fetchPRsIncremental(
        owner, 
        repo, 
        repository,
        since,
        force,
        onProgress,
        result
      );
      
      result.totalPRs = newPRs.length + updatedPRs.length;
      result.newPRs = newPRs.length;
      result.updatedPRs = updatedPRs.length;

      if (result.totalPRs === 0) {
        console.log(`✅ No new or updated PRs found for ${repository}`);
        onProgress?.({
          phase: 'complete',
          totalPRs: 0,
          processedPRs: 0,
          errors: [],
          timeElapsed: Date.now() - syncStartTime
        });
        return result;
      }

      console.log(`✅ Completed incremental sync: ${newPRs.length} new PRs, ${updatedPRs.length} updated PRs`);

      onProgress?.({
        phase: 'storing',
        totalPRs: result.totalPRs,
        processedPRs: result.totalPRs,
        errors: result.errors
      });

      onProgress?.({
        phase: 'complete',
        totalPRs: result.totalPRs,
        processedPRs: result.totalPRs,
        errors: result.errors,
        timeElapsed: Date.now() - syncStartTime
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ pr: 0, error: `Sync failed: ${errorMsg}` });
      console.error(`❌ Sync failed for ${repository}: ${errorMsg}`);
    }

    return result;
  }

  private parseRepository(repository: string): { owner: string; repo: string } {
    const match = repository.match(/^([^/]+)\/([^/]+)$/);
    if (!match) {
      throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
    }
    return { owner: match[1], repo: match[2] };
  }

  private determineSyncPoint(repository: string, since?: string, force?: boolean): string | undefined {
    if (force) {
      return since; // Use provided since date or fetch all
    }

    // Check for existing PRs to determine incremental sync point
    const existingPRs = this.storage.getPRs({ repository });
    if (existingPRs.length === 0) {
      return since; // First sync, use provided since date
    }

    // Find most recent PR update for incremental sync
    const mostRecentPR = existingPRs
      .filter(pr => pr.synced_at)
      .sort((a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime())[0];

    if (mostRecentPR) {
      // Use the most recent sync time as starting point
      return mostRecentPR.synced_at;
    }

    return since;
  }

  private async fetchPRsIncremental(
    owner: string, 
    repo: string, 
    repository: string,
    since?: string,
    force?: boolean,
    onProgress?: (progress: SyncProgress) => void,
    result?: PRSyncResult
  ): Promise<{ newPRs: RawPR[], updatedPRs: RawPR[] }> {
    const startTime = Date.now();
    const newPRs: RawPR[] = [];
    const updatedPRs: RawPR[] = [];
    
    let lastSyncedPRNumber: number;
    let lastSyncTime: string | null;
    
    if (force) {
      // Force mode: ignore incremental sync state
      lastSyncedPRNumber = 0;
      lastSyncTime = since || null;
      console.log(`[${repository}] Force sync mode - using provided since: ${since || 'all time'}`);
    } else {
      // Normal incremental mode
      lastSyncedPRNumber = this.incrementalSyncManager.getLastSyncedPRNumber(repository);
      lastSyncTime = this.incrementalSyncManager.getLastSyncTime(repository);
      console.log(`[${repository}] Last synced PR number: ${lastSyncedPRNumber}`);
    }

    // Fetch and process PRs incrementally with immediate storage
    await this.fetchAndProcessIncremental(
      owner, 
      repo, 
      repository, 
      lastSyncedPRNumber, 
      lastSyncTime, 
      force, 
      newPRs, 
      updatedPRs, 
      onProgress, 
      startTime,
      result
    );

    console.log(`[${repository}] Categorized: ${newPRs.length} new PRs, ${updatedPRs.length} updated PRs`);
    return { newPRs, updatedPRs };
  }

  private async fetchAndProcessIncremental(
    owner: string, 
    repo: string, 
    repository: string,
    lastSyncedPRNumber: number,
    lastSyncTime: string | null,
    force: boolean | undefined,
    newPRs: RawPR[],
    updatedPRs: RawPR[],
    onProgress?: (progress: SyncProgress) => void,
    startTime?: number,
    result?: PRSyncResult
  ): Promise<void> {
    let page = 1;
    const perPage = 100;
    let totalProcessed = 0;

    console.log(`[${repository}] Fetching and processing PRs incrementally (last synced: #${lastSyncedPRNumber})`);

    while (true) {
      const params: any = {
        owner,
        repo,
        state: 'all' as const,
        sort: 'updated' as const,
        direction: 'desc' as const,
        per_page: perPage,
        page
      };

      // If we have a last sync time, use it to filter
      if (lastSyncTime) {
        params.since = lastSyncTime;
      }

      const response = await this.octokit.rest.pulls.list(params);
      const prs = response.data as unknown as RawPR[];
      
      const rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
      const rateLimitResetAt = response.headers['x-ratelimit-reset'] 
        ? new Date(parseInt(response.headers['x-ratelimit-reset']) * 1000).toISOString()
        : undefined;

      if (prs.length === 0) {
        break;
      }

      console.log(`[${repository}] Page ${page}: Fetched ${prs.length} PRs, processing immediately...`);

      // Process each PR immediately as we fetch it
      for (const pr of prs) {
        if (force) {
          // In force mode, treat all PRs as new and process them
          newPRs.push(pr);
          try {
            await this.processPR(owner, repo, pr, result || { 
              totalPRs: 0, newPRs: 0, updatedPRs: 0, newReviews: 0, 
              errors: [], lastSyncAt: new Date().toISOString() 
            });
            totalProcessed++;
            console.log(`[${repository}] ✅ Processed PR #${pr.number} (${totalProcessed} total)`);
          } catch (error) {
            console.error(`[${repository}] ❌ Error processing PR #${pr.number}: ${error}`);
          }
        } else {
          // Normal incremental categorization and processing
          const decision = this.incrementalSyncManager.shouldProcessPR(
            repository,
            pr.number,
            pr.state,
            pr.updated_at || pr.created_at
          );
          
          if (decision.shouldProcess) {
            if (decision.reason === 'new-pr') {
              newPRs.push(pr);
            } else if (decision.reason === 'updated-open-pr') {
              updatedPRs.push(pr);
            }
            
            try {
              await this.processPR(owner, repo, pr, result || { 
                totalPRs: 0, newPRs: 0, updatedPRs: 0, newReviews: 0, 
                errors: [], lastSyncAt: new Date().toISOString() 
              });
              totalProcessed++;
              console.log(`[${repository}] ✅ Processed PR #${pr.number} (${decision.reason}) - ${totalProcessed} total`);
            } catch (error) {
              console.error(`[${repository}] ❌ Error processing PR #${pr.number}: ${error}`);
            }
          } else {
            console.log(`[${repository}] ⏭️  Skipping PR #${pr.number} (${decision.reason})`);
          }
        }
      }

      // Calculate time estimates
      const timeElapsed = startTime ? Date.now() - startTime : 0;
      let estimatedTimeRemaining: number | undefined;
      let estimatedTotalPages: number | undefined;

      // Estimate total pages and time remaining
      if (page > 1 && prs.length === perPage) {
        const avgTimePerPage = timeElapsed / page;
        estimatedTotalPages = Math.max(page * 2, page + 5);
        estimatedTimeRemaining = avgTimePerPage * (estimatedTotalPages - page);
      }

      // Send progress update
      onProgress?.({
        phase: 'processing', // Changed from 'fetching' since we're processing immediately
        totalPRs: totalProcessed,
        processedPRs: totalProcessed,
        errors: [],
        fetchProgress: {
          currentPage: page,
          estimatedTotalPages,
          prsThisPage: prs.length,
          rateLimitRemaining,
          rateLimitResetAt
        },
        timeElapsed,
        estimatedTimeRemaining
      });

      // If we got fewer than perPage, we're done
      if (prs.length < perPage) {
        break;
      }

      page++;

      // Add small delay to be nice to GitHub API
      if (rateLimitRemaining < 100) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[${repository}] ✅ Fetch and process complete: ${totalProcessed} PRs processed`);
  }

  private async fetchAllRelevantPRs(
    owner: string, 
    repo: string, 
    repository: string,
    lastSyncedPRNumber: number,
    lastSyncTime: string | null,
    force: boolean | undefined,
    allPRs: RawPR[],
    onProgress?: (progress: SyncProgress) => void,
    startTime?: number
  ): Promise<void> {
    let page = 1;
    const perPage = 100;

    console.log(`[${repository}] Fetching all PRs for incremental sync (last synced: #${lastSyncedPRNumber})`);

    while (true) {
      const params: any = {
        owner,
        repo,
        state: 'all' as const,
        sort: 'updated' as const, // Sort by updated to get both new and recently updated PRs
        direction: 'desc' as const,
        per_page: perPage,
        page
      };

      // If we have a last sync time, use it to filter
      if (lastSyncTime) {
        params.since = lastSyncTime;
      }

      const response = await this.octokit.rest.pulls.list(params);
      const prs = response.data as unknown as RawPR[];
      
      const rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
      const rateLimitResetAt = response.headers['x-ratelimit-reset'] 
        ? new Date(parseInt(response.headers['x-ratelimit-reset']) * 1000).toISOString()
        : undefined;

      if (prs.length === 0) {
        break;
      }

      allPRs.push(...prs);
      console.log(`[${repository}] Page ${page}: Fetched ${prs.length} PRs`);

      // Calculate time estimates
      const timeElapsed = startTime ? Date.now() - startTime : 0;
      let estimatedTimeRemaining: number | undefined;
      let estimatedTotalPages: number | undefined;

      // Estimate total pages and time remaining
      if (page > 1 && prs.length === perPage) {
        const avgTimePerPage = timeElapsed / page;
        estimatedTotalPages = Math.max(page * 2, page + 5);
        estimatedTimeRemaining = avgTimePerPage * (estimatedTotalPages - page);
      }

      // Send progress update
      onProgress?.({
        phase: 'fetching',
        totalPRs: allPRs.length,
        processedPRs: allPRs.length,
        errors: [],
        fetchProgress: {
          currentPage: page,
          estimatedTotalPages,
          prsThisPage: prs.length,
          rateLimitRemaining,
          rateLimitResetAt
        },
        timeElapsed,
        estimatedTimeRemaining
      });

      // If we got fewer than perPage, we're done
      if (prs.length < perPage) {
        break;
      }

      page++;

      // Add small delay to be nice to GitHub API
      if (rateLimitRemaining < 100) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }


  private async processPR(owner: string, repo: string, rawPR: RawPR, result: PRSyncResult): Promise<void> {
    const repository = `${owner}/${repo}`;
    

    // Get PR files for test detection
    const files = await this.fetchPRFiles(owner, repo, rawPR.number);
    const hasTests = this.detectTests(files);

    // Create PR record
    const prRecord: PullRequest = {
      number: rawPR.number,
      repository,
      author: rawPR.user?.login || 'unknown',
      title: rawPR.title,
      created_at: rawPR.created_at,
      merged_at: rawPR.merged_at,
      additions: rawPR.additions || 0,
      deletions: rawPR.deletions || 0,
      changed_files: rawPR.changed_files || 0,
      has_tests: hasTests,
      synced_at: new Date().toISOString()
    };

    // Store PR
    this.storage.addPR(prRecord);

    // Fetch and process reviews
    const reviews = await this.fetchPRReviews(owner, repo, rawPR.number);
    for (const rawReview of reviews) {
      if (rawReview.user?.login && rawReview.state && rawReview.submitted_at) {
        const reviewRecord: Review = {
          pr_number: rawPR.number,
          repository,
          reviewer: rawReview.user.login,
          state: rawReview.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
          submitted_at: rawReview.submitted_at,
          synced_at: new Date().toISOString()
        };

        this.storage.addReview(reviewRecord);
        result.newReviews++;
      }
    }
  }

  private async fetchPRFiles(owner: string, repo: string, prNumber: number): Promise<RawPRFile[]> {
    try {
      const response = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber
      });
      return response.data as RawPRFile[];
    } catch {
      // If we can't fetch files, return empty array (won't detect tests)
      return [];
    }
  }

  private async fetchPRReviews(owner: string, repo: string, prNumber: number): Promise<RawReview[]> {
    try {
      const response = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
      });
      return response.data as RawReview[];
    } catch {
      // If we can't fetch reviews, return empty array
      return [];
    }
  }

  private detectTests(files: RawPRFile[]): boolean {
    const testPatterns = [
      /\.test\./i,           // file.test.js, file.test.ts
      /\.spec\./i,           // file.spec.js, file.spec.ts  
      /(^|\/)tests?\//i,     // test/, tests/, /test/, /tests/
      /__tests__/i,          // __tests__ directory
      /\.stories\./i,        // Storybook stories
      /cypress\//i,          // Cypress tests
      /playwright\//i,       // Playwright tests
      /jest\.config/i,       // Jest config files
      /vitest\.config/i      // Vitest config files
    ];

    return files.some(file => 
      testPatterns.some(pattern => pattern.test(file.filename))
    );
  }
}