import type { Octokit } from '@octokit/rest';
import type { PullRequest, Review, StorageInterface } from '../storage/index.js';
import type { RawPR, RawReview, RawPRFile, SyncProgress } from '../../types/index.js';

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
  constructor(
    private octokit: Octokit,
    private storage: StorageInterface
  ) {}

  async syncRepository(options: PRSyncOptions): Promise<PRSyncResult> {
    const { repository, since, force, onProgress } = options;
    const { owner, repo } = this.parseRepository(repository);
    
    const result: PRSyncResult = {
      totalPRs: 0,
      newPRs: 0,
      updatedPRs: 0,
      newReviews: 0,
      errors: [],
      lastSyncAt: new Date().toISOString()
    };

    try {
      // Determine sync starting point
      const syncSince = this.determineSyncPoint(repository, since, force);
      
      onProgress?.({
        phase: 'fetching',
        totalPRs: 0,
        processedPRs: 0,
        errors: []
      });

      // Fetch all PRs (closed and merged)
      const allPRs = await this.fetchAllPRs(owner, repo, syncSince);
      result.totalPRs = allPRs.length;

      onProgress?.({
        phase: 'processing',
        totalPRs: allPRs.length,
        processedPRs: 0,
        errors: []
      });

      // Process each PR
      for (let i = 0; i < allPRs.length; i++) {
        const rawPR = allPRs[i];
        
        try {
          await this.processPR(owner, repo, rawPR, result);
          
          onProgress?.({
            phase: 'processing',
            totalPRs: allPRs.length,
            processedPRs: i + 1,
            currentPR: rawPR.number,
            errors: result.errors
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({ pr: rawPR.number, error: errorMsg });
        }
      }

      onProgress?.({
        phase: 'storing',
        totalPRs: allPRs.length,
        processedPRs: allPRs.length,
        errors: result.errors
      });

      onProgress?.({
        phase: 'complete',
        totalPRs: allPRs.length,
        processedPRs: allPRs.length,
        errors: result.errors
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ pr: 0, error: `Sync failed: ${errorMsg}` });
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

  private async fetchAllPRs(owner: string, repo: string, since?: string): Promise<RawPR[]> {
    const allPRs: RawPR[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const params: any = {
        owner,
        repo,
        state: 'all', // Include both open and closed PRs
        sort: 'updated',
        direction: 'desc',
        per_page: perPage,
        page
      };

      if (since) {
        params.since = since;
      }

      const response = await this.octokit.rest.pulls.list(params);
      const prs = response.data as unknown as RawPR[];

      if (prs.length === 0) {
        break; // No more PRs
      }

      allPRs.push(...prs);

      // If we got fewer than perPage, we're done
      if (prs.length < perPage) {
        break;
      }

      page++;
    }

    return allPRs;
  }

  private async processPR(owner: string, repo: string, rawPR: RawPR, result: PRSyncResult): Promise<void> {
    const repository = `${owner}/${repo}`;
    
    // Check if PR already exists
    const existingPRs = this.storage.getPRs({ 
      repository,
      author: rawPR.user?.login || 'unknown' 
    }).filter(pr => pr.number === rawPR.number);
    
    const isUpdate = existingPRs.length > 0;

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
    
    if (isUpdate) {
      result.updatedPRs++;
    } else {
      result.newPRs++;
    }

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