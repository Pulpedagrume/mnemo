/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlEngine } from '../sql';

/** Test engine on node:sqlite (files in a temp directory). */
export const nodeEngine: SqlEngine = {
  open(bytes) {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-apkg-'));
    const file = join(dir, 'collection.db');
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
  },
};
