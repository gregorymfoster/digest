/**
 * Configuration validation and loading with Zod
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import type { DigestConfig } from '../types/index.js';

const SyncErrorSchema = z.object({
  timestamp: z.string(),
  error: z.string(),
  type: z.enum(['auth', 'rate_limit', 'network', 'api', 'unknown'])
});

const TrackedRepositorySchema = z.object({
  name: z.string(),
  addedAt: z.string(),
  lastSyncAt: z.string().optional(),
  syncSince: z.string().optional(),
  active: z.boolean(),
  errors: z.array(SyncErrorSchema).optional()
});

const DigestConfigSchema = z.object({
  version: z.string().optional(),
  github: z.object({
    token: z.string().optional(),
    baseUrl: z.string().url().optional()
  }).optional(),
  repositories: z.array(TrackedRepositorySchema).optional(),
  settings: z.object({
    defaultTimeframe: z.string().optional(),
    autoSync: z.boolean().optional(),
    syncIntervalHours: z.number().min(1).max(168).optional(),
    dataRetentionDays: z.number().min(1).max(3650).optional()
  }).optional(),
  concurrency: z.number().min(1).max(50).optional(),
  outputDir: z.string().optional(),
  cacheDir: z.string().optional(),
  database: z.object({
    path: z.string().optional()
  }).optional()
});

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<DigestConfig> = {
  version: '1.0',
  github: {},
  repositories: [],
  settings: {
    defaultTimeframe: '30d',
    autoSync: false,
    syncIntervalHours: 6,
    dataRetentionDays: 365
  },
  concurrency: 10,
  outputDir: './digest',
  cacheDir: './.digest-cache',
  database: {
    path: './.digest/digest.db'
  }
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
      version: validated.version ?? DEFAULT_CONFIG.version,
      github: { ...DEFAULT_CONFIG.github, ...validated.github },
      repositories: validated.repositories ?? DEFAULT_CONFIG.repositories,
      settings: { ...DEFAULT_CONFIG.settings, ...validated.settings },
      concurrency: validated.concurrency ?? DEFAULT_CONFIG.concurrency,
      outputDir: validated.outputDir ?? DEFAULT_CONFIG.outputDir,
      cacheDir: validated.cacheDir ?? DEFAULT_CONFIG.cacheDir,
      database: { ...DEFAULT_CONFIG.database, ...validated.database }
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
  repositories?: string[]; // List of owner/repo to track
  outputDir?: string;
  concurrency?: number;
  database?: { path?: string };
}): DigestConfig => {
  const now = new Date().toISOString();
  
  return {
    version: DEFAULT_CONFIG.version,
    github: {
      ...(options.github?.token && { token: options.github.token }),
      ...(options.github?.baseUrl && { baseUrl: options.github.baseUrl })
    },
    repositories: options.repositories?.map(name => ({
      name,
      addedAt: now,
      active: true
    })) || [],
    settings: DEFAULT_CONFIG.settings,
    concurrency: options.concurrency || DEFAULT_CONFIG.concurrency,
    outputDir: options.outputDir || DEFAULT_CONFIG.outputDir,
    cacheDir: DEFAULT_CONFIG.cacheDir,
    database: {
      path: options.database?.path || DEFAULT_CONFIG.database.path
    }
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