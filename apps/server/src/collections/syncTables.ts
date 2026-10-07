import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { Clock } from '@mnemo/core';
import {
  ChangeSchema,
  changeKey,
  type BatchRegistry,
  type Change,
  type ChangeLog,
  type MediaBlobStore,
  type PullResponse,
  type PushResponse,
} from '@mnemo/sync';

/**
 * Server-only tables of a user (`users/<id>.server.sqlite`): the numbered change log, the
 * registry of applied push batches and media contents by SHA-256.
 */
export const SYNC_DDL = `
CREATE TABLE IF NOT EXISTS server_sync_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS server_sync_changes_key ON server_sync_changes(key);
CREATE TABLE IF NOT EXISTS server_sync_batches (
  batch_id TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS server_sync_media (
  sha256 TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const ChangeRowSchema = z.object({ seq: z.number(), kind: z.string(), data: z.string() });
const PushResponseSchema = z.object({ applied: z.number(), cursor: z.number() });

function inTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Change log numbered by `seq` (the pull cursor). Entries are merged states, so a newer entry
 * for the same entity supersedes the older one, which is deleted (compaction loses nothing).
 */
export class SqliteChangeLog implements ChangeLog {
  constructor(private readonly db: DatabaseSync) {}

  append(changes: readonly Change[]): Promise<number> {
    const drop = this.db.prepare('DELETE FROM server_sync_changes WHERE key = ?');
    const insert = this.db.prepare(
      'INSERT INTO server_sync_changes (key, kind, data) VALUES (?, ?, ?)',
    );
    inTransaction(this.db, () => {
      for (const c of changes) {
        const key = changeKey(c);
        drop.run(key);
        insert.run(key, c.kind, JSON.stringify(c.data));
      }
    });
    return this.lastSeq();
  }

  since(cursor: number, limit: number): Promise<PullResponse> {
    const rows = this.db
      .prepare('SELECT seq, kind, data FROM server_sync_changes WHERE seq > ? ORDER BY seq LIMIT ?')
      .all(cursor, limit + 1)
      .map((r) => ChangeRowSchema.parse(r));
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const changes = page.map((r) =>
      ChangeSchema.parse({ kind: r.kind, data: JSON.parse(r.data) as unknown }),
    );
    const last = page.at(-1);
    return Promise.resolve({ changes, cursor: last ? last.seq : cursor, hasMore });
  }

  lastSeq(): Promise<number> {
    // AUTOINCREMENT keeps the highest seq ever assigned even after compaction deleted it.
    const row = this.db
      .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'server_sync_changes'")
      .get();
    return Promise.resolve(Number(row?.seq ?? 0));
  }
}

/** Remembers the response of every applied push so a replayed batch is not applied twice. */
export class SqliteBatchRegistry implements BatchRegistry {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock,
  ) {}

  get(batchId: string): Promise<PushResponse | undefined> {
    const row = this.db
      .prepare('SELECT response FROM server_sync_batches WHERE batch_id = ?')
      .get(batchId);
    if (!row || typeof row.response !== 'string') return Promise.resolve(undefined);
    return Promise.resolve(PushResponseSchema.parse(JSON.parse(row.response)));
  }

  put(batchId: string, res: PushResponse): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO server_sync_batches (batch_id, response, created_at) VALUES (?, ?, ?)',
      )
      .run(batchId, JSON.stringify(res), this.clock.now());
    return Promise.resolve();
  }
}

/** Media contents addressed by SHA-256 (the route verifies the hash before `put`). */
export class SqliteMediaBlobs implements MediaBlobStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock,
  ) {}

  has(sha256: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 AS x FROM server_sync_media WHERE sha256 = ?')
      .get(sha256);
    return Promise.resolve(row !== undefined);
  }

  put(sha256: string, bytes: Uint8Array): Promise<void> {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO server_sync_media (sha256, bytes, size, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(sha256, bytes, bytes.byteLength, this.clock.now());
    return Promise.resolve();
  }

  get(sha256: string): Promise<Uint8Array | undefined> {
    const row = this.db.prepare('SELECT bytes FROM server_sync_media WHERE sha256 = ?').get(sha256);
    const bytes = row?.bytes;
    return Promise.resolve(bytes instanceof Uint8Array ? bytes : undefined);
  }
}
