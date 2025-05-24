import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { loadConfig, generateConfig, validateRepository, DEFAULT_CONFIG } from './config.js';

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

describe('Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should return default config when no file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const config = await loadConfig();
      
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should load and merge config from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        github: { token: 'test-token' },
        concurrency: 5
      }));
      
      const config = await loadConfig('test.config.json');
      
      expect(config).toEqual({
        version: '1.0',
        github: { token: 'test-token' },
        repositories: [],
        settings: {
          defaultTimeframe: '30d',
          autoSync: false,
          syncIntervalHours: 6,
          dataRetentionDays: 365
        },
        concurrency: 5,
        outputDir: './digest',
        cacheDir: './.digest-cache',
        database: { path: './.digest/digest.db' }
      });
    });

    it('should throw error for invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');
      
      await expect(loadConfig('test.config.json')).rejects.toThrow(
        'Failed to load config from test.config.json'
      );
    });

    it('should validate configuration schema', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        concurrency: -1, // Invalid
        github: { baseUrl: 'not-a-url' } // Invalid
      }));
      
      await expect(loadConfig('test.config.json')).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should find config file automatically', async () => {
      vi.mocked(existsSync).mockImplementation((path) => 
        path === 'digest.config.json'
      );
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        outputDir: './custom'
      }));
      
      const config = await loadConfig();
      
      expect(readFileSync).toHaveBeenCalledWith('digest.config.json', 'utf-8');
      expect(config.outputDir).toBe('./custom');
    });
  });

  describe('generateConfig', () => {
    it('should generate config with provided options', () => {
      const config = generateConfig({
        github: { token: 'test-token', baseUrl: 'https://github.enterprise.com' },
        concurrency: 15,
        outputDir: './custom-output'
      });
      
      expect(config).toEqual({
        version: '1.0',
        github: {
          token: 'test-token',
          baseUrl: 'https://github.enterprise.com'
        },
        repositories: [],
        settings: {
          defaultTimeframe: '30d',
          autoSync: false,
          syncIntervalHours: 6,
          dataRetentionDays: 365
        },
        concurrency: 15,
        outputDir: './custom-output',
        cacheDir: './.digest-cache',
        database: { path: './.digest/digest.db' }
      });
    });

    it('should generate config with defaults', () => {
      const config = generateConfig({});
      
      expect(config).toEqual({
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
        database: { path: './.digest/digest.db' }
      });
    });

    it('should omit undefined github options', () => {
      const config = generateConfig({
        github: { token: undefined, baseUrl: 'https://api.github.com' }
      });
      
      expect(config.github).toEqual({
        baseUrl: 'https://api.github.com'
      });
      expect(config.github).not.toHaveProperty('token');
    });

    it('should generate config with repositories', () => {
      const config = generateConfig({
        repositories: ['facebook/react', 'microsoft/typescript']
      });
      
      expect(config.repositories).toHaveLength(2);
      expect(config.repositories?.[0]).toMatchObject({
        name: 'facebook/react',
        active: true
      });
      expect(config.repositories?.[1]).toMatchObject({
        name: 'microsoft/typescript', 
        active: true
      });
      // Should have addedAt timestamps
      expect(config.repositories?.[0].addedAt).toBeDefined();
      expect(config.repositories?.[1].addedAt).toBeDefined();
    });
  });

  describe('validateRepository', () => {
    it('should validate correct repository format', () => {
      const result = validateRepository('owner/repo');
      
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should validate repository with special characters', () => {
      const result = validateRepository('my-org/my-repo.test');
      
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo.test' });
    });

    it('should throw error for invalid format', () => {
      expect(() => validateRepository('invalid')).toThrow(
        'Invalid repository format: invalid. Expected format: owner/repo'
      );
    });

    it('should throw error for multiple slashes', () => {
      expect(() => validateRepository('owner/repo/extra')).toThrow(
        'Invalid repository format: owner/repo/extra. Expected format: owner/repo'
      );
    });

    it('should throw error for empty parts', () => {
      expect(() => validateRepository('owner/')).toThrow(
        'Invalid repository format: owner/. Expected format: owner/repo'
      );
      
      expect(() => validateRepository('/repo')).toThrow(
        'Invalid repository format: /repo. Expected format: owner/repo'
      );
    });
  });
});