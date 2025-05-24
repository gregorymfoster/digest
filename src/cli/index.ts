/**
 * digest CLI entry point
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get package.json for version (ES module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, '../../package.json');

let version = '0.0.0';
try {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  version = packageJson.version;
} catch {
  // Fallback version if package.json not found
}

const program = new Command();

program
  .name('digest')
  .description('Management insights dashboard for software development teams')
  .version(version);

import {
  executeInitCommand,
  executeAddCommand,
  executeRemoveCommand,
  executeListCommand,
  executeStatusCommand,
  executeSyncCommand,
  executeContributorsCommand,
  executeReviewsCommand,
  executeExportCommand
} from './commands/index.js';

// Init command - initialize workspace
program
  .command('init')
  .description('Initialize digest workspace and save GitHub token')
  .option('--token <token>', 'GitHub token (or will prompt)')
  .action(executeInitCommand);

// Add command - add repository to tracking
program
  .command('add')
  .description('Add repository to tracking')
  .argument('<repo>', 'Repository (owner/repo format)')
  .option('--since <date>', 'Sync PRs since date (YYYY-MM-DD or 30d, 90d, 1y)')
  .action((repo, options) => executeAddCommand(repo, options));

// Remove command - remove repository from tracking
program
  .command('remove')
  .description('Remove repository from tracking')
  .argument('<repo>', 'Repository (owner/repo format)')
  .action(executeRemoveCommand);

// List command - list tracked repositories
program
  .command('list')
  .description('List tracked repositories')
  .action(executeListCommand);

// Status command - show workspace status
program
  .command('status')
  .description('Show workspace status and last sync times')
  .action(executeStatusCommand);

// Sync command - sync repositories
program
  .command('sync')
  .description('Sync PR data from tracked repositories')
  .argument('[repo]', 'Specific repository to sync (optional)')
  .option('--force', 'Force full re-sync (ignore last sync point)')
  .option('--since <date>', 'Sync PRs since date (for new repos)')
  .action((repo, options) => executeSyncCommand({ repository: repo, ...options }));

// Contributors command - show top contributors
program
  .command('contributors')
  .description('Show top contributors across tracked repositories')
  .option('--repository <repo>', 'Focus on specific repository')
  .option('--timeframe <period>', 'Timeframe (7d, 30d, 90d, 1y)', '30d')
  .option('--limit <number>', 'Number of contributors to show', '10')
  .action((options) => executeContributorsCommand({
    ...options,
    limit: parseInt(options.limit)
  }));

// Reviews command - show review analytics
program
  .command('reviews')
  .description('Show review turnaround times and stats')
  .option('--repository <repo>', 'Focus on specific repository')
  .option('--reviewer <name>', 'Focus on specific reviewer')
  .option('--timeframe <period>', 'Timeframe (7d, 30d, 90d, 1y)', '30d')
  .action(executeReviewsCommand);

// Export command - export data
program
  .command('export')
  .description('Export analytics data to CSV or JSON')
  .option('--repository <repo>', 'Export specific repository data')
  .option('--format <format>', 'Output format (csv, json)', 'csv')
  .option('--output <file>', 'Output file path (auto-generated if not specified)')
  .option('--timeframe <period>', 'Timeframe (7d, 30d, 90d, 1y)', '30d')
  .action((options) => executeExportCommand({
    format: options.format as 'csv' | 'json',
    output: options.output,
    timeframe: options.timeframe,
    repository: options.repository
  }));

// Parse command line arguments only when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { program };