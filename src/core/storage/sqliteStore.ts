import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { DatabaseProvider, PullRequest, Review, Stats, StorageInterface } from './types.js';

const SCHEMA_VERSION = 1;

const createTables = (db: Database.Database): void => {
  db.exec(`
    -- Core PR data (simplified)
    CREATE TABLE IF NOT EXISTS prs (
      number INTEGER,
      repository TEXT,
      author TEXT NOT NULL,
      title TEXT,
      created_at TEXT,
      merged_at TEXT,
      
      -- Size metrics
      additions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      changed_files INTEGER DEFAULT 0,
      
      -- Simple quality indicators
      has_tests BOOLEAN DEFAULT FALSE,
      
      -- Sync metadata
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      PRIMARY KEY (repository, number)
    );

    -- Code review data (simplified)
    CREATE TABLE IF NOT EXISTS reviews (
      pr_number INTEGER NOT NULL,
      repository TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      state TEXT NOT NULL, -- APPROVED, CHANGES_REQUESTED, COMMENTED
      submitted_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      PRIMARY KEY (repository, pr_number, reviewer),
      FOREIGN KEY (repository, pr_number) REFERENCES prs(repository, number) ON DELETE CASCADE
    );

    -- Aggregated statistics (simplified)
    CREATE TABLE IF NOT EXISTS stats (
      repository TEXT,
      author TEXT,
      period_start TEXT, -- ISO date
      period_end TEXT,   -- ISO date
      
      -- Core metrics
      prs_created INTEGER DEFAULT 0,
      prs_merged INTEGER DEFAULT 0,
      lines_added INTEGER DEFAULT 0,
      lines_deleted INTEGER DEFAULT 0,
      reviews_given INTEGER DEFAULT 0,
      reviews_received INTEGER DEFAULT 0,
      avg_pr_size REAL DEFAULT 0,
      
      -- Sync metadata
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      PRIMARY KEY (repository, author, period_start)
    );

    -- Schema version tracking
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
  `);
};

export class SqliteStore implements StorageInterface, DatabaseProvider {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    createTables(this.db);
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // PR operations
  getPRs(filters?: Partial<Pick<PullRequest, 'repository' | 'author'>>): PullRequest[] {
    let query = 'SELECT * FROM prs';
    const params: unknown[] = [];
    
    if (filters && Object.keys(filters).length > 0) {
      const conditions: string[] = [];
      if (filters.repository) {
        conditions.push('repository = ?');
        params.push(filters.repository);
      }
      if (filters.author) {
        conditions.push('author = ?');
        params.push(filters.author);
      }
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    // Convert SQLite integer back to boolean for has_tests
    return rows.map(row => ({
      ...row,
      has_tests: Boolean(row.has_tests)
    })) as PullRequest[];
  }

  addPR(pr: PullRequest): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO prs (
        number, repository, author, title, created_at, merged_at,
        additions, deletions, changed_files, has_tests, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      pr.number, pr.repository, pr.author, pr.title, pr.created_at, pr.merged_at,
      pr.additions, pr.deletions, pr.changed_files, pr.has_tests ? 1 : 0, pr.synced_at
    );
  }

  updatePR(repository: string, number: number, updates: Partial<PullRequest>): void {
    const fields = Object.keys(updates).filter(key => key !== 'number' && key !== 'repository');
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => {
      const value = updates[field as keyof PullRequest];
      // Convert boolean to integer for SQLite
      if (field === 'has_tests' && typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      return value;
    });
    
    const stmt = this.db.prepare(`
      UPDATE prs SET ${setClause} WHERE repository = ? AND number = ?
    `);
    
    stmt.run(...values, repository, number);
  }

  deletePR(repository: string, number: number): void {
    const stmt = this.db.prepare('DELETE FROM prs WHERE repository = ? AND number = ?');
    stmt.run(repository, number);
  }

  // Review operations
  getReviews(filters?: Partial<Pick<Review, 'repository' | 'reviewer' | 'pr_number'>>): Review[] {
    let query = 'SELECT * FROM reviews';
    const params: unknown[] = [];
    
    if (filters && Object.keys(filters).length > 0) {
      const conditions: string[] = [];
      if (filters.repository) {
        conditions.push('repository = ?');
        params.push(filters.repository);
      }
      if (filters.reviewer) {
        conditions.push('reviewer = ?');
        params.push(filters.reviewer);
      }
      if (filters.pr_number) {
        conditions.push('pr_number = ?');
        params.push(filters.pr_number);
      }
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY submitted_at DESC';
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Review[];
  }

  addReview(review: Review): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reviews (
        pr_number, repository, reviewer, state, submitted_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      review.pr_number, review.repository, review.reviewer, 
      review.state, review.submitted_at, review.synced_at
    );
  }

  updateReview(repository: string, pr_number: number, reviewer: string, updates: Partial<Review>): void {
    const fields = Object.keys(updates).filter(key => 
      key !== 'pr_number' && key !== 'repository' && key !== 'reviewer'
    );
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field as keyof Review]);
    
    const stmt = this.db.prepare(`
      UPDATE reviews SET ${setClause} WHERE repository = ? AND pr_number = ? AND reviewer = ?
    `);
    
    stmt.run(...values, repository, pr_number, reviewer);
  }

  deleteReview(repository: string, pr_number: number, reviewer: string): void {
    const stmt = this.db.prepare('DELETE FROM reviews WHERE repository = ? AND pr_number = ? AND reviewer = ?');
    stmt.run(repository, pr_number, reviewer);
  }

  // Stats operations
  getStats(filters?: Partial<Pick<Stats, 'repository' | 'author'>>): Stats[] {
    let query = 'SELECT * FROM stats';
    const params: unknown[] = [];
    
    if (filters && Object.keys(filters).length > 0) {
      const conditions: string[] = [];
      if (filters.repository) {
        conditions.push('repository = ?');
        params.push(filters.repository);
      }
      if (filters.author) {
        conditions.push('author = ?');
        params.push(filters.author);
      }
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY period_start DESC';
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Stats[];
  }

  addStats(stats: Stats): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stats (
        repository, author, period_start, period_end, prs_created, prs_merged,
        lines_added, lines_deleted, reviews_given, reviews_received, avg_pr_size, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      stats.repository, stats.author, stats.period_start, stats.period_end,
      stats.prs_created, stats.prs_merged, stats.lines_added, stats.lines_deleted,
      stats.reviews_given, stats.reviews_received, stats.avg_pr_size, stats.synced_at
    );
  }

  updateStats(repository: string, author: string, period_start: string, updates: Partial<Stats>): void {
    const fields = Object.keys(updates).filter(key => 
      key !== 'repository' && key !== 'author' && key !== 'period_start'
    );
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field as keyof Stats]);
    
    const stmt = this.db.prepare(`
      UPDATE stats SET ${setClause} WHERE repository = ? AND author = ? AND period_start = ?
    `);
    
    stmt.run(...values, repository, author, period_start);
  }

  deleteStats(repository: string, author: string, period_start: string): void {
    const stmt = this.db.prepare('DELETE FROM stats WHERE repository = ? AND author = ? AND period_start = ?');
    stmt.run(repository, author, period_start);
  }
}