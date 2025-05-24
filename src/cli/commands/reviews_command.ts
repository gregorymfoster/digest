import chalk from 'chalk';
import { WorkspaceManager } from '../../core/workspace/index.js';
import { SqliteStore } from '../../core/storage/index.js';
import { getReviewAnalytics } from '../../core/analytics/index.js';
import type { ReviewSummary } from '../../core/analytics/index.js';

export interface ReviewsCommandOptions {
  timeframe?: string;
  repository?: string;
  reviewer?: string;
}

/**
 * Format review summary
 */
const formatReviewSummary = (summary: ReviewSummary): void => {
  const { avgMetrics, timeframe } = summary;
  
  console.log(chalk.cyan.bold(`\n📋 Review Analytics (${timeframe})`));
  console.log(chalk.gray('─'.repeat(60)));
  
  // Key metrics
  console.log(chalk.white.bold('⏱️  Timing Metrics:'));
  console.log(`  Time to first review: ${chalk.yellow(avgMetrics.timeToFirstReview)}`);
  console.log(`  Time to merge: ${chalk.green(avgMetrics.timeToMerge)}`);
  console.log(`  Reviews per PR: ${chalk.blue(avgMetrics.reviewsPerPR.toString())}`);
};

/**
 * Format top reviewers table
 */
const formatReviewersTable = (summary: ReviewSummary): void => {
  const { topReviewers } = summary;
  
  if (topReviewers.length === 0) {
    console.log(chalk.yellow('\nNo reviewers found for the specified criteria.'));
    return;
  }
  
  console.log(chalk.white.bold('\n👥 Top Reviewers:'));
  console.log(chalk.gray('─'.repeat(70)));
  
  // Table header
  const header = sprintf(
    '%-3s %-20s %-8s %-12s %-12s',
    '#', 'Reviewer', 'Reviews', 'Avg Time', 'Approval %'
  );
  console.log(chalk.white.bold(header));
  console.log(chalk.gray('─'.repeat(70)));
  
  // Table rows
  topReviewers.slice(0, 10).forEach((reviewer, index) => {
    const rank = chalk.cyan(`${index + 1}.`);
    const name = chalk.white(reviewer.reviewer);
    const reviews = chalk.green(reviewer.reviewsGiven.toString());
    const avgTime = chalk.yellow(formatTime(reviewer.avgResponseTime));
    const approvalRate = chalk.blue(`${reviewer.approvalRate.toFixed(1)}%`);
    
    const row = sprintf(
      '%-3s %-20s %-8s %-12s %-12s',
      rank, name, reviews, avgTime, approvalRate
    );
    console.log(row);
  });
};

/**
 * Format fastest and slowest reviews
 */
const formatReviewTimings = (summary: ReviewSummary): void => {
  const { fastestReviews, slowestReviews } = summary;
  
  if (fastestReviews.length > 0) {
    console.log(chalk.white.bold('\n⚡ Fastest Reviews:'));
    console.log(chalk.gray('─'.repeat(70)));
    
    fastestReviews.slice(0, 5).forEach((timing, index) => {
      const time = timing.timeToFirstReview ? formatTime(timing.timeToFirstReview) : 'N/A';
      console.log(
        `${chalk.cyan(`${index + 1}.`)} ${chalk.white(`PR #${timing.prNumber}`)} ` +
        `(${chalk.gray(timing.repository)}) - ${chalk.yellow(time)} ` +
        `by ${chalk.blue(timing.author)}`
      );
    });
  }
  
  if (slowestReviews.length > 0) {
    console.log(chalk.white.bold('\n🐌 Slowest Reviews:'));
    console.log(chalk.gray('─'.repeat(70)));
    
    slowestReviews.slice(0, 5).forEach((timing, index) => {
      const time = timing.timeToFirstReview ? formatTime(timing.timeToFirstReview) : 'N/A';
      console.log(
        `${chalk.cyan(`${index + 1}.`)} ${chalk.white(`PR #${timing.prNumber}`)} ` +
        `(${chalk.gray(timing.repository)}) - ${chalk.red(time)} ` +
        `by ${chalk.blue(timing.author)}`
      );
    });
  }
};

/**
 * Show specific reviewer details
 */
const showReviewerDetails = async (
  storage: SqliteStore,
  reviewer: string,
  _options: ReviewsCommandOptions
): Promise<void> => {
  console.log(chalk.cyan.bold(`\n🔍 Reviewer Analysis: ${reviewer}`));
  console.log(chalk.gray('─'.repeat(60)));
  
  const allReviews = storage.getReviews();
  const reviewerReviews = allReviews.filter(r => r.reviewer === reviewer);
  
  if (reviewerReviews.length === 0) {
    console.log(chalk.yellow(`No reviews found for ${reviewer}`));
    return;
  }
  
  // Basic stats
  const approvals = reviewerReviews.filter(r => r.state === 'APPROVED').length;
  const changesRequested = reviewerReviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
  const comments = reviewerReviews.filter(r => r.state === 'COMMENTED').length;
  
  console.log(chalk.white('📊 Review Breakdown:'));
  console.log(`  Approvals: ${chalk.green(approvals)} (${((approvals / reviewerReviews.length) * 100).toFixed(1)}%)`);
  console.log(`  Changes Requested: ${chalk.red(changesRequested)} (${((changesRequested / reviewerReviews.length) * 100).toFixed(1)}%)`);
  console.log(`  Comments: ${chalk.yellow(comments)} (${((comments / reviewerReviews.length) * 100).toFixed(1)}%)`);
  
  // Repository breakdown
  const repoStats = new Map<string, number>();
  reviewerReviews.forEach(review => {
    repoStats.set(review.repository, (repoStats.get(review.repository) || 0) + 1);
  });
  
  console.log(chalk.white('\n📂 Repository Activity:'));
  Array.from(repoStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([repo, count]) => {
      console.log(`  ${chalk.white(repo)}: ${chalk.cyan(count)} reviews`);
    });
};

/**
 * Format time duration
 */
const formatTime = (hours: number): string => {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  } else {
    return `${(hours / 24).toFixed(1)}d`;
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

/**
 * Execute reviews command
 */
export const executeReviewsCommand = async (options: ReviewsCommandOptions): Promise<void> => {
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
      const allReviews = storage.getReviews();
      
      if (allPRs.length === 0) {
        console.log(chalk.yellow('⚠️  No PR data found.'));
        console.log(chalk.cyan('Run "digest sync <owner/repo>" to collect data first.'));
        return;
      }
      
      if (allReviews.length === 0) {
        console.log(chalk.yellow('⚠️  No review data found.'));
        console.log(chalk.gray('This could mean:'));
        console.log(chalk.gray('  • PRs have no reviews yet'));
        console.log(chalk.gray('  • Data needs to be synced again'));
        return;
      }
      
      // Get analytics
      const analyticsOptions = {
        timeframe: options.timeframe,
        repositories: options.repository ? [options.repository] : undefined
      };
      
      const summary = await getReviewAnalytics(storage, analyticsOptions);
      
      // Display results
      formatReviewSummary(summary);
      
      if (options.reviewer) {
        // Show specific reviewer details
        await showReviewerDetails(storage, options.reviewer, options);
      } else {
        // Show general review analytics
        formatReviewersTable(summary);
        formatReviewTimings(summary);
      }
      
      // Show helpful tips
      console.log(chalk.gray('\n💡 Tips:'));
      console.log(chalk.gray('  • Use --reviewer <name> to focus on specific reviewer'));
      console.log(chalk.gray('  • Use --timeframe to filter by time (7d, 30d, 90d, 1y)'));
      console.log(chalk.gray('  • Use --repository to focus on specific repo'));
      
    } finally {
      storage.close();
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to get review analytics:'));
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
};