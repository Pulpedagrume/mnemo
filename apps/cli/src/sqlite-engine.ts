import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlEngine } from '@mnemo/importers';

/**
 * SQL engine for Anki packages on `node:sqlite`. An in-memory database cannot be loaded from or
 * serialized to bytes with this API, so each database lives in a private temporary file that is
 * removed on close.
 */
export const nodeSqlEngine: SqlEngine = {
  open(bytes) {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-apkg-'));
    const file = join(dir, 'collection.anki2');
    try {
      if (bytes) writeFileSync(file, bytes);
      const db = new DatabaseSync(file);
      return Promise.resolve({
        all: (sql, params = []) =>
          db.prepare(sql).all(...(params as SQLInputValue[])) as Record<string, unknown>[],
        run: (sql, params) => {
          if (params) db.prepare(sql).run(...(params as SQLInputValue[]));
          else db.exec(sql);
        },
        export: () => new Uint8Array(readFileSync(file)),
        close: () => {
          db.close();
          rmSync(dir, { recursive: true, force: true });
        },
      });
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  },
};
