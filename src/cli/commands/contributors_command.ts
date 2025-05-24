import chalk from 'chalk';
import { WorkspaceManager } from '../../core/workspace/index.js';
import { SqliteStore } from '../../core/storage/index.js';
import { getContributorAnalytics } from '../../core/analytics/index.js';
import type { ContributorSummary } from '../../core/analytics/index.js';

export interface ContributorsCommandOptions {
  timeframe?: string;
  repository?: string;
  limit?: number;
}

/**
 * Format contributor table
 */
const formatContributorTable = (summary: ContributorSummary): void => {
  const { topContributors, totalPRs, totalLines, avgPRSize, testRate, timeframe } = summary;
  
  // Header
  console.log(chalk.cyan.bold(`\n📊 Top Contributors (${timeframe})`));
  console.log(chalk.gray('─'.repeat(80)));
  
  if (topContributors.length === 0) {
    console.log(chalk.yellow('No contributors found for the specified criteria.'));
    return;
  }
  
  // Table header
  const header = sprintf(
    '%-3s %-20s %-8s %-12s %-12s',
    '#', 'Contributor', 'PRs', 'Lines', 'Avg Merge'
  );
  console.log(chalk.white.bold(header));
  console.log(chalk.gray('─'.repeat(80)));
  
  // Table rows
  topContributors.forEach((contributor, index) => {
    const rank = chalk.cyan(`${index + 1}.`);
    const name = chalk.white(contributor.author);
    const prs = chalk.green(contributor.prs.toString());
    const lines = chalk.blue(formatLines(contributor.lines));
    const mergeTime = chalk.yellow(contributor.avgMergeTime);
    
    const row = sprintf(
      '%-3s %-20s %-8s %-12s %-12s',
      rank, name, prs, lines, mergeTime
    );
    console.log(row);
  });
  
  // Summary stats
  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.white(`Total: ${chalk.cyan(summary.totalContributors)} contributors, ${chalk.green(totalPRs)} PRs`));
  console.log(chalk.white(`Lines: ${chalk.blue(formatLines(totalLines))} total, ${chalk.blue(Math.round(avgPRSize))} avg per PR`));
  console.log(chalk.white(`Tests: ${chalk.yellow(Math.round(testRate))}% of PRs include tests`));
};

/**
 * Format large numbers
 */
const formatLines = (lines: number): string => {
  if (lines >= 1000000) {
    return `${(lines / 1000000).toFixed(1)}M`;
  } else if (lines >= 1000) {
    return `${(lines / 1000).toFixed(1)}k`;
  }
  return lines.toString();
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

/**
 * Show detailed contributor view
 */
const showDetailedView = async (
  storage: SqliteStore,
  options: ContributorsCommandOptions
): Promise<void> => {
  console.log(chalk.cyan('\n🔍 Detailed Contributor Analysis'));
  
  // Get all contributor metrics for detailed analysis
  const prs = storage.getPRs();
  
  // Apply filters
  let filteredPRs = prs;
  if (options.repository) {
    filteredPRs = prs.filter(pr => pr.repository === options.repository);
  }
  
  if (filteredPRs.length === 0) {
    console.log(chalk.yellow('No data found for the specified criteria.'));
    return;
  }
  
  // Get unique contributors
  const contributors = [...new Set(filteredPRs.map(pr => pr.author))];
  
  console.log(chalk.gray(`Analyzing ${contributors.length} contributors across ${filteredPRs.length} PRs\n`));
  
  // Show repository breakdown if analyzing multiple repos
  if (!options.repository) {
    const repoStats = new Map<string, number>();
    filteredPRs.forEach(pr => {
      repoStats.set(pr.repository, (repoStats.get(pr.repository) || 0) + 1);
    });
    
    console.log(chalk.cyan('📂 Repository Breakdown:'));
    Array.from(repoStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([repo, count]) => {
        console.log(`  ${chalk.white(repo)}: ${chalk.green(count)} PRs`);
      });
  }
  
  // Show test coverage by contributor
  console.log(chalk.cyan('\n🧪 Test Coverage by Contributor:'));
  contributors
    .map(author => {
      const authorPRs = filteredPRs.filter(pr => pr.author === author);
      const testPRs = authorPRs.filter(pr => pr.has_tests);
      const testRate = authorPRs.length > 0 ? (testPRs.length / authorPRs.length) * 100 : 0;
      return { author, testRate, totalPRs: authorPRs.length };
    })
    .sort((a, b) => b.testRate - a.testRate)
    .slice(0, 10)
    .forEach(({ author, testRate, totalPRs }) => {
      const rate = testRate.toFixed(1);
      const color = testRate >= 80 ? chalk.green : testRate >= 50 ? chalk.yellow : chalk.red;
      console.log(`  ${chalk.white(author)}: ${color(rate + '%')} (${totalPRs} PRs)`);
    });
};

/**
 * Execute contributors command
 */
export const executeContributorsCommand = async (options: ContributorsCommandOptions): Promise<void> => {
  const workspace = new WorkspaceManager();
  
  try {
    // Check if workspace is initialized
    if (!workspace.isInitialized()) {
      console.error(chalk.red('❌ Workspace not initialized.'));
      console.log(chalk.yellow('Run "digest init" first to set up your workspace.'));
      process.exit(1);
    }

    // Load configuration and data
    const config = await workspace.load();
    const storage = new SqliteStore(config.database?.path || './.digest/digest.db');
    
    try {
      // Check if we have any data
      const allPRs = storage.getPRs();
      if (allPRs.length === 0) {
        console.log(chalk.yellow('⚠️  No PR data found.'));
        console.log(chalk.cyan('Run "digest sync <owner/repo>" to collect data first.'));
        return;
      }
      
      // Get analytics
      const analyticsOptions = {
        timeframe: options.timeframe,
        repositories: options.repository ? [options.repository] : undefined,
        limit: options.limit || 10
      };
      
      const summary = await getContributorAnalytics(storage, analyticsOptions);
      
      // Display results
      formatContributorTable(summary);
      
      // Show detailed view if requested
      if (options.limit && options.limit > 10) {
        await showDetailedView(storage, options);
      }
      
      // Show helpful tips
      console.log(chalk.gray('\n💡 Tips:'));
      console.log(chalk.gray('  • Use --timeframe to filter by time (7d, 30d, 90d, 1y)'));
      console.log(chalk.gray('  • Use --repository to focus on specific repo'));
      console.log(chalk.gray('  • Use --limit to show more contributors'));
      
    } finally {
      storage.close();
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to get contributor analytics:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};