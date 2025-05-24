import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import { WorkspaceManager } from '../../core/workspace/index.js';
import { SyncOrchestrator } from '../../core/sync/index.js';
import type { SyncProgress } from '../../types/index.js';

export interface SyncCommandOptions {
  repository?: string;
  force?: boolean;
  since?: string;
}

/**
 * Format sync progress for display
 */
const formatProgress = (repository: string, progress: SyncProgress): string => {
  const { phase, processedPRs, totalPRs, currentPR } = progress;
  
  switch (phase) {
    case 'fetching':
      return `Fetching PRs from ${repository}...`;
    case 'processing':
      const current = currentPR ? ` (PR #${currentPR})` : '';
      return `Processing ${processedPRs}/${totalPRs} PRs${current}`;
    case 'storing':
      return `Storing data...`;
    case 'complete':
      return `✅ Synced ${totalPRs} PRs`;
    default:
      return `Processing...`;
  }
};

/**
 * Execute sync command
 */
export const executeSyncCommand = async (options: SyncCommandOptions): Promise<void> => {
  const workspace = new WorkspaceManager();
  const orchestrator = new SyncOrchestrator(workspace);

  try {
    // Check if workspace is initialized
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      console.log(chalk.yellow('Run "digest init" first to set up your workspace.'));
      process.exit(1);
    }

    if (options.repository) {
      // Sync specific repository
      await syncSingleRepository(orchestrator, options.repository, options);
    } else {
      // Sync all tracked repositories
      await syncAllRepositories(orchestrator, options);
    }

  } catch (error) {
    console.error(chalk.red('❌ Sync failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Sync a single repository
 */
const syncSingleRepository = async (
  orchestrator: SyncOrchestrator,
  repository: string,
  options: SyncCommandOptions
): Promise<void> => {
  const spinner = ora(`Syncing ${repository}...`).start();
  
  try {
    const result = await orchestrator.syncSingleRepository(repository, {
      force: options.force,
      onProgress: (progress) => {
        spinner.text = formatProgress(repository, progress);
      }
    });

    spinner.succeed(chalk.green(`✅ Successfully synced ${repository}`));
    
    // Show summary
    console.log(chalk.cyan('\n📊 Sync Summary:'));
    console.log(`  New PRs: ${chalk.green(result.newPRs)}`);
    console.log(`  Updated PRs: ${chalk.yellow(result.updatedPRs)}`);
    console.log(`  New Reviews: ${chalk.blue(result.newReviews)}`);
    
    if (result.errors.length > 0) {
      console.log(`  Errors: ${chalk.red(result.errors.length)}`);
      console.log(chalk.yellow('\n⚠️  Some PRs failed to sync:'));
      result.errors.slice(0, 3).forEach(error => {
        console.log(`    PR #${error.pr}: ${error.error}`);
      });
      if (result.errors.length > 3) {
        console.log(`    ... and ${result.errors.length - 3} more`);
      }
    }

  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to sync ${repository}`));
    throw error;
  }
};

/**
 * Sync all tracked repositories
 */
const syncAllRepositories = async (
  orchestrator: SyncOrchestrator,
  options: SyncCommandOptions
): Promise<void> => {
  const workspace = new WorkspaceManager();
  const activeRepos = await workspace.getActiveRepositories();
  
  if (activeRepos.length === 0) {
    console.log(chalk.yellow('⚠️  No repositories are being tracked.'));
    console.log(chalk.cyan('Add repositories with: digest add <owner/repo>'));
    return;
  }

  console.log(chalk.cyan(`🔄 Syncing ${activeRepos.length} repositories...\n`));
  
  const spinners = new Map<string, Ora>();
  
  // Initialize spinners for each repository
  for (const repo of activeRepos) {
    const spinner = ora(`Waiting to sync ${repo.name}...`).start();
    spinners.set(repo.name, spinner);
  }

  try {
    const result = await orchestrator.syncAll({
      force: options.force,
      onProgress: (repository, progress) => {
        const spinner = spinners.get(repository);
        if (spinner) {
          spinner.text = formatProgress(repository, progress);
        }
      },
      onComplete: (repository, result) => {
        const spinner = spinners.get(repository);
        if (spinner) {
          spinner.succeed(chalk.green(`✅ ${repository} (${result.totalPRs} PRs)`));
        }
      },
      onError: (repository, error) => {
        const spinner = spinners.get(repository);
        if (spinner) {
          spinner.fail(chalk.red(`❌ ${repository}: ${error.message}`));
        }
      }
    });

    // Stop any remaining spinners
    for (const spinner of spinners.values()) {
      if (spinner.isSpinning) {
        spinner.stop();
      }
    }

    // Show final summary
    console.log(chalk.cyan('\n📊 Sync Summary:'));
    console.log(`  Repositories synced: ${chalk.green(result.successfulSyncs)}/${result.totalRepositories}`);
    
    if (result.failedSyncs > 0) {
      console.log(`  Failed syncs: ${chalk.red(result.failedSyncs)}`);
    }

    // Show detailed results
    const successful = result.results.filter(r => r.success);
    if (successful.length > 0) {
      const totalPRs = successful.reduce((sum, r) => sum + (r.result?.totalPRs || 0), 0);
      const newPRs = successful.reduce((sum, r) => sum + (r.result?.newPRs || 0), 0);
      const newReviews = successful.reduce((sum, r) => sum + (r.result?.newReviews || 0), 0);
      
      console.log(`  Total PRs processed: ${chalk.blue(totalPRs)}`);
      console.log(`  New PRs: ${chalk.green(newPRs)}`);
      console.log(`  New Reviews: ${chalk.blue(newReviews)}`);
    }

    if (result.failedSyncs > 0) {
      console.log(chalk.yellow('\n⚠️  Failed repositories:'));
      result.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  ${r.repository}: ${r.error}`);
        });
    }

  } catch (error) {
    // Stop all spinners on error
    for (const spinner of spinners.values()) {
      spinner.stop();
    }
    throw error;
  }
};