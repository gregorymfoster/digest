import { WorkspaceManager } from '../../core/workspace/index.js';
import { SqliteStore } from '../../core/storage/index.js';
import { computeAnalytics, parseTimeframe } from '../../core/analytics/index.js';
import { formatAsJson, formatAsCsv } from '../../core/export/data_formatters.js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

export interface ExportCommandOptions {
  format: 'json' | 'csv';
  output?: string;
  timeframe: string;
  repository?: string;
}

export const executeExportCommand = async (options: ExportCommandOptions): Promise<void> => {
  const spinner = ora('Preparing export...').start();
  
  try {
    const workspace = new WorkspaceManager();
    
    if (!workspace.isInitialized()) {
      spinner.fail('No workspace found. Run "digest init" first.');
      return;
    }
    
    const config = workspace.getConfig();
    const repositories = options.repository ? [options.repository] : config.repositories;
    
    if (repositories.length === 0) {
      spinner.fail('No repositories configured. Add repositories with "digest add <repo>".');
      return;
    }
    
    // Validate timeframe
    let timeRange: { start?: Date; end?: Date };
    try {
      timeRange = parseTimeframe(options.timeframe);
    } catch {
      spinner.fail(`Invalid timeframe: ${options.timeframe}`);
      return;
    }
    
    spinner.text = 'Computing analytics...';
    
    const store = new SqliteStore(workspace.getDataPath());
    const analytics = await computeAnalytics(store, {
      timeframe: options.timeframe,
      start: timeRange.start,
      end: timeRange.end,
      repositories
    });
    
    spinner.text = 'Formatting data...';
    
    let content: string;
    let extension: string;
    
    if (options.format === 'json') {
      content = formatAsJson(analytics);
      extension = 'json';
    } else {
      content = formatAsCsv(analytics);
      extension = 'csv';
    }
    
    // Determine output file
    let outputPath: string;
    if (options.output) {
      outputPath = resolve(options.output);
    } else {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const repoSuffix = repositories.length === 1 ? 
        `-${repositories[0].replace(/[^a-zA-Z0-9]/g, '-')}` : 
        '-all-repos';
      outputPath = resolve(`digest-export-${timestamp}${repoSuffix}.${extension}`);
    }
    
    spinner.text = 'Writing file...';
    writeFileSync(outputPath, content, 'utf8');
    
    spinner.succeed(`Export completed: ${chalk.green(outputPath)}`);
    
    // Display summary
    console.log();
    console.log(chalk.blue('📊 Export Summary:'));
    console.log(`Format: ${chalk.yellow(options.format.toUpperCase())}`);
    console.log(`Timeframe: ${chalk.yellow(options.timeframe)}`);
    console.log(`Repositories: ${chalk.yellow(repositories.length === 1 ? repositories[0] : `${repositories.length} repos`)}`);
    console.log(`Total PRs: ${chalk.green(analytics.overview.totalPRs)}`);
    console.log(`Contributors: ${chalk.green(analytics.overview.totalContributors)}`);
    console.log(`File size: ${chalk.gray(getFileSizeString(content.length))}`);
    
  } catch (error) {
    if (error instanceof Error) {
      spinner.fail(`Export failed: ${error.message}`);
    } else {
      spinner.fail('Export failed with unknown error');
    }
    process.exit(1);
  }
};

const getFileSizeString = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};