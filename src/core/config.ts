/**
 * Configuration validation and loading with Zod
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import type { DigestConfig } from '../types/index.js';

const DigestConfigSchema = z.object({
  github: z.object({
    token: z.string().optional(),
    baseUrl: z.string().url().optional()
  }).optional(),
  concurrency: z.number().min(1).max(50).optional(),
  outputDir: z.string().optional(),
  cacheDir: z.string().optional(),
  dataRetentionDays: z.number().min(1).max(3650).optional()
});

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<DigestConfig> = {
  github: {},
  concurrency: 10,
  outputDir: './digest',
  cacheDir: './.digest-cache',
  dataRetentionDays: 365
};

/**
 * Load and validate configuration from file or use defaults
 */
export const loadConfig = async (configPath?: string): Promise<DigestConfig> => {
  let userConfig: Partial<DigestConfig> = {};
  
  // Try to load from file
  const configFile = configPath || findConfigFile();
  if (configFile && existsSync(configFile)) {
    try {
      const configContent = readFileSync(configFile, 'utf-8');
      userConfig = JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Failed to load config from ${configFile}: ${error}`);
    }
  }
  
  // Validate configuration
  try {
    const validated = DigestConfigSchema.parse(userConfig);
    
    // Merge with defaults
    return {
      github: { ...DEFAULT_CONFIG.github, ...validated.github },
      concurrency: validated.concurrency ?? DEFAULT_CONFIG.concurrency,
      outputDir: validated.outputDir ?? DEFAULT_CONFIG.outputDir,
      cacheDir: validated.cacheDir ?? DEFAULT_CONFIG.cacheDir,
      dataRetentionDays: validated.dataRetentionDays ?? DEFAULT_CONFIG.dataRetentionDays
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new Error(`Configuration validation failed:\n${issues}`);
    }
    throw error;
  }
};

/**
 * Find configuration file in common locations
 */
function findConfigFile(): string | null {
  const possibleFiles = [
    'digest.config.json',
    'digest.config.js',
    '.digestrc',
    '.digestrc.json'
  ];
  
  for (const file of possibleFiles) {
    if (existsSync(file)) {
      return file;
    }
  }
  
  return null;
}

/**
 * Generate initial configuration file
 */
export const generateConfig = (options: {
  github?: { token?: string; baseUrl?: string };
  outputDir?: string;
  concurrency?: number;
}): DigestConfig => {
  return {
    github: {
      ...(options.github?.token && { token: options.github.token }),
      ...(options.github?.baseUrl && { baseUrl: options.github.baseUrl })
    },
    concurrency: options.concurrency || DEFAULT_CONFIG.concurrency,
    outputDir: options.outputDir || DEFAULT_CONFIG.outputDir,
    cacheDir: DEFAULT_CONFIG.cacheDir,
    dataRetentionDays: DEFAULT_CONFIG.dataRetentionDays
  };
};

/**
 * Validate repository format (owner/repo)
 */
export const validateRepository = (repo: string): { owner: string; repo: string } => {
  const match = repo.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid repository format: ${repo}. Expected format: owner/repo`);
  }
  
  return { owner: match[1], repo: match[2] };
};