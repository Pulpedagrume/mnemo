// Node-only module: pulls in the `node:sqlite` declarations from @types/node (the base tsconfig sets
// `types: []`). Nothing outside `src/sqlite` imports this folder, so browser code never sees them.
/// <reference types="node" />
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { migrate } from './schema';

export type SqlValue = SQLInputValue;
export type SqlRow = Record<string, unknown>;

/**
 * Thin wrapper over a `node:sqlite` connection: statement cache, savepoint-based atomic blocks and
 * explicit transaction control. Every call is synchronous; `SqliteScheduler` (see `scheduler.ts`)
 * serialises the asynchronous repository calls on top of it.
 */
export class SqliteDriver {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private savepoints = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    // WAL only applies to files; ':memory:' silently keeps its own journal mode.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    // Entities are soft-deleted and reference each other loosely: no foreign keys.
    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.exec('PRAGMA busy_timeout = 5000');
    migrate(this);
  }

  /** Executes one or more statements without parameters (DDL, pragmas). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  private statement(sql: string): StatementSync {
    let stmt = this.statements.get(sql);
    if (stmt === undefined) {
      stmt = this.db.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  all(sql: string, ...params: SqlValue[]): SqlRow[] {
    return this.statement(sql).all(...params);
  }

  get(sql: string, ...params: SqlValue[]): SqlRow | undefined {
    return this.statement(sql).get(...params);
  }

  run(sql: string, ...params: SqlValue[]): void {
    this.statement(sql).run(...params);
  }

  /**
   * Runs `body` atomically through a savepoint: a transaction of its own outside a transaction, a
   * nested, independently rolled-back unit inside one.
   */
  atomic<T>(body: () => T): T {
    const name = `sp${String(this.savepoints++)}`;
    try {
      this.db.exec(`SAVEPOINT ${name}`);
    } catch (error) {
      this.savepoints--;
      throw error;
    }
    try {
      const result = body();
      this.db.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw error;
    } finally {
      this.savepoints--;
    }
  }

  begin(): void {
    this.db.exec('BEGIN IMMEDIATE');
  }

  commit(): void {
    this.db.exec('COMMIT');
  }

  rollback(): void {
    // A failed COMMIT or an SQLite error may already have ended the transaction.
    if (this.db.isTransaction) this.db.exec('ROLLBACK');
  }

  close(): void {
    this.statements.clear();
    if (this.db.isOpen) this.db.close();
  }
}

/** Binds an optional value (`undefined` is not a valid SQLite parameter). */
export function opt(value: SqlValue | undefined): SqlValue {
  return value === undefined ? null : value;
}

/** Booleans are stored as 0/1. */
export function bool(value: boolean | undefined): number {
  return value === true ? 1 : 0;
}

/** A list parameter, expanded in SQL with `IN (SELECT value FROM json_each(?))`. */
export function list(values: readonly string[]): string {
  return JSON.stringify(values);
}

/** `LIMIT ?` value: SQLite treats a negative limit as "no limit". */
export function limitParam(limit: number | undefined): number {
  return limit === undefined ? -1 : Math.max(0, limit);
}

export const IN_LIST = 'IN (SELECT value FROM json_each(?))';
