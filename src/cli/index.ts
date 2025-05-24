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

// Sync command - collect PR data
program
  .command('sync')
  .description('Sync PR data from repository')
  .argument('<repo>', 'Repository (owner/repo format)')
  .option('--since <date>', 'Sync PRs since date (YYYY-MM-DD)')
  .action((repo, options) => {
    console.log(`digest sync ${repo} - implementation coming soon`);
    if (options.since) {
      console.log(`Since: ${options.since}`);
    }
  });

// Contributors command - show top contributors
program
  .command('contributors')
  .description('Show top contributors')
  .option('--timeframe <period>', 'Timeframe (30d, 90d, 1y)', '30d')
  .action((options) => {
    console.log(`digest contributors --timeframe ${options.timeframe} - implementation coming soon`);
  });

// Reviews command - show review analytics
program
  .command('reviews')
  .description('Show review turnaround times and stats')
  .option('--reviewer <name>', 'Focus on specific reviewer')
  .action((options) => {
    console.log('digest reviews - implementation coming soon');
    if (options.reviewer) {
      console.log(`Reviewer: ${options.reviewer}`);
    }
  });

// Export command - export data
program
  .command('export')
  .description('Export data to CSV or JSON')
  .option('--csv', 'Export as CSV (default)')
  .option('--json', 'Export as JSON')
  .action((options) => {
    const format = options.json ? 'JSON' : 'CSV';
    console.log(`digest export --${format.toLowerCase()} - implementation coming soon`);
  });

// Parse command line arguments only when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { program };