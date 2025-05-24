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

// Init command - initialize workspace
program
  .command('init')
  .description('Initialize digest workspace and save GitHub token')
  .option('--token <token>', 'GitHub token (or will prompt)')
  .action((options) => {
    console.log('digest init - implementation coming soon');
    if (options.token) {
      console.log('Token provided via --token');
    }
  });

// Add command - add repository to tracking
program
  .command('add')
  .description('Add repository to tracking')
  .argument('<repo>', 'Repository (owner/repo format)')
  .option('--since <date>', 'Sync PRs since date (YYYY-MM-DD or 30d, 90d, 1y)')
  .action((repo, options) => {
    console.log(`digest add ${repo} - implementation coming soon`);
    if (options.since) {
      console.log(`Since: ${options.since}`);
    }
  });

// Remove command - remove repository from tracking
program
  .command('remove')
  .description('Remove repository from tracking')
  .argument('<repo>', 'Repository (owner/repo format)')
  .action((repo) => {
    console.log(`digest remove ${repo} - implementation coming soon`);
  });

// List command - list tracked repositories
program
  .command('list')
  .description('List tracked repositories')
  .action(() => {
    console.log('digest list - implementation coming soon');
  });

// Status command - show workspace status
program
  .command('status')
  .description('Show workspace status and last sync times')
  .action(() => {
    console.log('digest status - implementation coming soon');
  });

// Sync command - sync repositories
program
  .command('sync')
  .description('Sync PR data from tracked repositories')
  .argument('[repo]', 'Specific repository to sync (optional)')
  .option('--force', 'Force full re-sync (ignore last sync point)')
  .action((repo, options) => {
    const target = repo || 'all tracked repositories';
    console.log(`digest sync ${target} - implementation coming soon`);
    if (options.force) {
      console.log('Force mode: full re-sync');
    }
  });

// Contributors command - show top contributors
program
  .command('contributors')
  .description('Show top contributors across tracked repositories')
  .option('--repo <repo>', 'Focus on specific repository')
  .option('--timeframe <period>', 'Timeframe (30d, 90d, 1y)', '30d')
  .action((options) => {
    const scope = options.repo ? `for ${options.repo}` : 'across all repos';
    console.log(`digest contributors ${scope} --timeframe ${options.timeframe} - implementation coming soon`);
  });

// Reviews command - show review analytics
program
  .command('reviews')
  .description('Show review turnaround times and stats')
  .option('--repo <repo>', 'Focus on specific repository')
  .option('--reviewer <name>', 'Focus on specific reviewer')
  .action((options) => {
    console.log('digest reviews - implementation coming soon');
    if (options.repo) {
      console.log(`Repository: ${options.repo}`);
    }
    if (options.reviewer) {
      console.log(`Reviewer: ${options.reviewer}`);
    }
  });

// Export command - export data
program
  .command('export')
  .description('Export data to CSV or JSON')
  .option('--repo <repo>', 'Export specific repository data')
  .option('--csv', 'Export as CSV (default)')
  .option('--json', 'Export as JSON')
  .action((options) => {
    const format = options.json ? 'JSON' : 'CSV';
    const scope = options.repo ? `for ${options.repo}` : 'all data';
    console.log(`digest export ${scope} --${format.toLowerCase()} - implementation coming soon`);
  });

// Parse command line arguments only when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { program };