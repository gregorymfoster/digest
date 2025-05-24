import chalk from 'chalk';
import { WorkspaceManager } from '../../core/workspace/index.js';
import { SqliteStore } from '../../core/storage/index.js';

export interface InitCommandOptions {
  token?: string;
}

export interface AddCommandOptions {
  since?: string;
}

/**
 * Execute init command
 */
export const executeInitCommand = async (options: InitCommandOptions): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    console.log(chalk.cyan('🚀 Initializing digest workspace...'));
    
    if (workspace.isInitialized()) {
      console.log(chalk.yellow('⚠️  Workspace already initialized.'));
      const config = await workspace.load();
      const repoCount = config.repositories?.length || 0;
      console.log(chalk.gray(`Current workspace has ${repoCount} tracked repositories.`));
      return;
    }
    
    await workspace.init(options.token);
    
    console.log(chalk.green('✅ Workspace initialized successfully!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Add repositories: digest add <owner/repo>'));
    console.log(chalk.gray('  2. Sync data: digest sync'));
    console.log(chalk.gray('  3. View analytics: digest contributors'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize workspace:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Execute add command
 */
export const executeAddCommand = async (repository: string, options: AddCommandOptions): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      console.log(chalk.yellow('Run "digest init" first to set up your workspace.'));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`📂 Adding repository: ${repository}`));
    
    await workspace.addRepository({
      repository,
      since: options.since
    });
    
    console.log(chalk.green(`✅ Successfully added ${repository} to tracking`));
    
    if (options.since) {
      console.log(chalk.gray(`Will sync PRs since: ${options.since}`));
    }
    
    console.log(chalk.gray('\nNext step: digest sync'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to add repository:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Execute remove command
 */
export const executeRemoveCommand = async (repository: string): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      process.exit(1);
    }
    
    console.log(chalk.yellow(`🗑️  Removing repository: ${repository}`));
    
    await workspace.removeRepository(repository);
    
    console.log(chalk.green(`✅ Successfully removed ${repository} from tracking`));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to remove repository:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Execute list command
 */
export const executeListCommand = async (): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      console.log(chalk.yellow('Run "digest init" first to set up your workspace.'));
      process.exit(1);
    }
    
    const trackedRepos = await workspace.getTrackedRepositories();
    
    if (trackedRepos.length === 0) {
      console.log(chalk.yellow('📂 No repositories are being tracked.'));
      console.log(chalk.gray('Add repositories with: digest add <owner/repo>'));
      return;
    }
    
    console.log(chalk.cyan.bold(`📂 Tracked Repositories (${trackedRepos.length})`));
    console.log(chalk.gray('─'.repeat(80)));
    
    // Table header
    const header = sprintf(
      '%-3s %-30s %-12s %-20s %-8s',
      '#', 'Repository', 'Status', 'Last Sync', 'Active'
    );
    console.log(chalk.white.bold(header));
    console.log(chalk.gray('─'.repeat(80)));
    
    // Table rows
    trackedRepos.forEach((repo, index) => {
      const rank = chalk.cyan(`${index + 1}.`);
      const name = chalk.white(repo.name);
      const status = repo.lastSyncAt ? chalk.green('Synced') : chalk.yellow('Not synced');
      const lastSync = repo.lastSyncAt 
        ? chalk.gray(formatDate(repo.lastSyncAt))
        : chalk.gray('Never');
      const active = repo.active ? chalk.green('Yes') : chalk.red('No');
      
      const row = sprintf(
        '%-3s %-30s %-12s %-20s %-8s',
        rank, name, status, lastSync, active
      );
      console.log(row);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to list repositories:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Execute status command
 */
export const executeStatusCommand = async (): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      console.log(chalk.yellow('Run "digest init" first to set up your workspace.'));
      process.exit(1);
    }
    
    const info = await workspace.getInfo();
    const config = await workspace.load();
    
    console.log(chalk.cyan.bold('📊 Workspace Status'));
    console.log(chalk.gray('─'.repeat(50)));
    
    // Basic info
    console.log(chalk.white('📁 Configuration:'));
    console.log(`  Config file: ${chalk.gray(info.configPath)}`);
    console.log(`  Database: ${chalk.gray(info.databasePath)}`);
    console.log(`  Repositories: ${chalk.cyan(info.trackedRepos.length)} tracked`);
    
    // Data stats
    if (info.trackedRepos.length > 0) {
      const storage = new SqliteStore(config.database?.path || './.digest/digest.db');
      
      try {
        const allPRs = storage.getPRs();
        const allReviews = storage.getReviews();
        
        console.log(chalk.white('\n📈 Data Summary:'));
        console.log(`  PRs: ${chalk.green(allPRs.length)}`);
        console.log(`  Reviews: ${chalk.blue(allReviews.length)}`);
        console.log(`  Contributors: ${chalk.yellow(new Set(allPRs.map(pr => pr.author)).size)}`);
        
        // Recent activity
        const recentPRs = allPRs
          .filter(pr => new Date(pr.synced_at) > new Date(Date.now() - 24 * 60 * 60 * 1000))
          .length;
        
        if (recentPRs > 0) {
          console.log(`  Synced today: ${chalk.cyan(recentPRs)} PRs`);
        }
        
      } finally {
        storage.close();
      }
    }
    
    // Repository status
    if (info.trackedRepos.length > 0) {
      console.log(chalk.white('\n📂 Repository Status:'));
      
      const activeRepos = info.trackedRepos.filter(r => r.active);
      const syncedRepos = info.trackedRepos.filter(r => r.lastSyncAt);
      
      console.log(`  Active: ${chalk.green(activeRepos.length)}/${info.trackedRepos.length}`);
      console.log(`  Synced: ${chalk.blue(syncedRepos.length)}/${info.trackedRepos.length}`);
      
      // Show repos with errors
      const reposWithErrors = info.trackedRepos.filter(r => r.errors && r.errors.length > 0);
      if (reposWithErrors.length > 0) {
        console.log(`  With errors: ${chalk.red(reposWithErrors.length)}`);
      }
      
      // Next sync recommendations
      const oldSyncs = info.trackedRepos.filter(r => {
        if (!r.lastSyncAt) return true;
        const daysSince = (Date.now() - new Date(r.lastSyncAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 1;
      });
      
      if (oldSyncs.length > 0) {
        console.log(chalk.yellow(`\n⚠️  ${oldSyncs.length} repositories need syncing`));
        console.log(chalk.gray('Run "digest sync" to update all repositories'));
      }
    } else {
      console.log(chalk.yellow('\n📂 No repositories tracked yet.'));
      console.log(chalk.gray('Add repositories with: digest add <owner/repo>'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get workspace status:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};

/**
 * Format date for display
 */
const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    return diffHours === 0 ? 'Just now' : `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

/**
 * Simple sprintf implementation for table formatting
 */
const sprintf = (format: string, ...args: string[]): string => {
  return format.replace(/%-?(\d+)s/g, (match, width) => {
    const arg = args.shift() || '';
    const w = parseInt(width);
    return arg.padEnd(w).slice(0, w);
  });
};