import type { Repository } from '../repository';
import { SqliteDriver } from './driver';
import type { Runner } from './entities';
import { SqliteScheduler, settle } from './scheduler';
import { ALL_TABLES } from './schema';
import { createSqliteStores } from './stores';

export { MIGRATIONS, migrate } from './schema';

export interface SqliteRepositoryOptions {
  /** Database file path, or `':memory:'` for a private in-memory database. */
  path: string;
}

/**
 * SQLite repository for Node (server, CLI), on the built-in `node:sqlite` module (Node >= 22.13;
 * no native dependency). Some Node versions print an `ExperimentalWarning` when it is first loaded.
 *
 * Entities are stored as JSON (`data` column) next to indexed scalar columns; values are parsed
 * on every read, so callers always get fresh copies. The schema is versioned (`schema.ts`).
 *
 * Transactions: `BEGIN IMMEDIATE` … `COMMIT`, or `ROLLBACK` when `fn` throws. The connection is
 * shared, so transactions are serialised and calls made on the repository while one is open wait
 * for it to finish (see `SqliteScheduler`): inside `fn`, only use the stores passed as argument —
 * awaiting a repository call there deadlocks. Stores handed to `fn` reject once it has ended.
 */
export function createSqliteRepository(options: SqliteRepositoryOptions): Repository {
  const driver = new SqliteDriver(options.path);
  const scheduler = new SqliteScheduler();
  const run: Runner = (body) => scheduler.run(() => body(driver));

  return {
    ...createSqliteStores(run),

    async transaction(fn) {
      await scheduler.acquire();
      let active = true;
      const txRun: Runner = (body) =>
        settle(() => {
          if (!active) throw new Error('Transaction is no longer active');
          return body(driver);
        });
      try {
        driver.begin();
        try {
          const result = await fn(createSqliteStores(txRun));
          active = false;
          driver.commit();
          return result;
        } catch (error) {
          active = false;
          driver.rollback();
          throw error;
        }
      } finally {
        active = false;
        scheduler.release();
      }
    },

    clear: () =>
      run((db) => {
        db.atomic(() => {
          for (const table of ALL_TABLES) db.run(`DELETE FROM ${table}`);
        });
      }),

    async close() {
      await scheduler.acquire();
      try {
        driver.close();
      } finally {
        scheduler.release();
      }
    },
  };
}
