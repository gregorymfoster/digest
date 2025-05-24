import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { DigestConfig, TrackedRepository, SyncError } from '../../types/index.js';
import { loadConfig, DEFAULT_CONFIG } from '../config.js';
import { getGitHubToken } from '../github/auth.js';

export interface WorkspaceInfo {
  configPath: string;
  databasePath: string;
  isInitialized: boolean;
  trackedRepos: TrackedRepository[];
}

export interface AddRepositoryOptions {
  repository: string;
  since?: string; // Date to start syncing from
}

export class WorkspaceManager {
  private configPath: string;
  private config: DigestConfig | null = null;

  constructor(workspaceDir: string = '.digest') {
    this.configPath = join(workspaceDir, 'config.json');
  }

  /**
   * Initialize workspace with GitHub token and basic configuration
   */
  async init(token?: string): Promise<void> {
    // Get or prompt for GitHub token
    let githubToken = token;
    if (!githubToken) {
      try {
        githubToken = await getGitHubToken();
      } catch {
        throw new Error('GitHub token is required for initialization. Please provide a token or authenticate with gh CLI.');
      }
    }
    
    // Create workspace directory if it doesn't exist
    const workspaceDir = dirname(this.configPath);
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    // Create initial configuration
    const config: DigestConfig = {
      version: DEFAULT_CONFIG.version,
      github: {
        token: githubToken
      },
      repositories: [],
      settings: DEFAULT_CONFIG.settings,
      concurrency: DEFAULT_CONFIG.concurrency,
      outputDir: DEFAULT_CONFIG.outputDir,
      cacheDir: DEFAULT_CONFIG.cacheDir,
      database: DEFAULT_CONFIG.database
    };

    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Load existing workspace configuration
   */
  async load(): Promise<DigestConfig> {
    if (this.config) {
      return this.config;
    }

    this.config = await loadConfig(this.configPath);
    return this.config;
  }

  /**
   * Check if workspace is initialized
   */
  isInitialized(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Get workspace information
   */
  async getInfo(): Promise<WorkspaceInfo> {
    const isInit = this.isInitialized();
    let trackedRepos: TrackedRepository[] = [];
    
    if (isInit) {
      const config = await this.load();
      trackedRepos = config.repositories || [];
    }

    return {
      configPath: this.configPath,
      databasePath: DEFAULT_CONFIG.database.path || './.digest/digest.db',
      isInitialized: isInit,
      trackedRepos
    };
  }

  /**
   * Add repository to tracking
   */
  async addRepository(options: AddRepositoryOptions): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized. Run "digest init" first.');
    }

    const config = await this.load();
    const { repository, since } = options;

    // Validate repository format
    if (!repository.match(/^[^/]+\/[^/]+$/)) {
      throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
    }

    // Check if repository is already tracked
    const existing = config.repositories?.find(repo => repo.name === repository);
    if (existing) {
      throw new Error(`Repository ${repository} is already being tracked`);
    }

    // Add repository
    const newRepo: TrackedRepository = {
      name: repository,
      addedAt: new Date().toISOString(),
      syncSince: since,
      active: true
    };

    config.repositories = config.repositories || [];
    config.repositories.push(newRepo);

    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Remove repository from tracking
   */
  async removeRepository(repository: string): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized. Run "digest init" first.');
    }

    const config = await this.load();
    const repos = config.repositories || [];
    const index = repos.findIndex(repo => repo.name === repository);

    if (index === -1) {
      throw new Error(`Repository ${repository} is not being tracked`);
    }

    repos.splice(index, 1);
    config.repositories = repos;

    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Update repository sync status
   */
  async updateRepositorySync(repository: string, lastSyncAt: string, errors?: SyncError[]): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized');
    }

    const config = await this.load();
    const repo = config.repositories?.find(r => r.name === repository);
    
    if (!repo) {
      throw new Error(`Repository ${repository} is not being tracked`);
    }

    repo.lastSyncAt = lastSyncAt;
    if (errors && errors.length > 0) {
      repo.errors = errors.slice(-5); // Keep last 5 errors
    }

    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Get tracked repositories
   */
  async getTrackedRepositories(): Promise<TrackedRepository[]> {
    if (!this.isInitialized()) {
      return [];
    }

    const config = await this.load();
    return config.repositories || [];
  }

  /**
   * Get active (enabled) repositories
   */
  async getActiveRepositories(): Promise<TrackedRepository[]> {
    const repos = await this.getTrackedRepositories();
    return repos.filter(repo => repo.active);
  }

  /**
   * Enable/disable repository tracking
   */
  async setRepositoryActive(repository: string, active: boolean): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized');
    }

    const config = await this.load();
    const repo = config.repositories?.find(r => r.name === repository);
    
    if (!repo) {
      throw new Error(`Repository ${repository} is not being tracked`);
    }

    repo.active = active;
    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Update workspace settings
   */
  async updateSettings(settings: Partial<DigestConfig['settings']>): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized');
    }

    const config = await this.load();
    config.settings = { ...config.settings, ...settings };
    
    this.saveConfig(config);
    this.config = config;
  }

  /**
   * Get GitHub token from configuration
   */
  async getGitHubToken(): Promise<string> {
    if (!this.isInitialized()) {
      throw new Error('Workspace not initialized. Run "digest init" first.');
    }

    const config = await this.load();
    
    if (config.github?.token) {
      return config.github.token;
    }

    // Fall back to auth hierarchy if token not in config
    return getGitHubToken(config);
  }

  private saveConfig(config: DigestConfig): void {
    const workspaceDir = dirname(this.configPath);
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}