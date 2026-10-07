import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Clock } from '@mnemo/core';
import { createServiceContext, type ServiceContext } from '@mnemo/services';
import type { Repository } from '@mnemo/storage';
import { createHlcClock, withSyncStamps } from '@mnemo/sync';
import { cryptoRng } from '../accounts/crypto';
import { openRepository } from './repository';
import { SYNC_DDL, SqliteBatchRegistry, SqliteChangeLog, SqliteMediaBlobs } from './syncTables';

/** Everything the API needs for one user's collection. */
export interface UserCollection {
  userId: string;
  /** Raw repository: the sync engine writes merged data through it without re-stamping. */
  repo: Repository;
  /** Services context whose repository stamps writes with HLCs (server-side imports). */
  ctx: ServiceContext;
  changeLog: SqliteChangeLog;
  batches: SqliteBatchRegistry;
  media: SqliteMediaBlobs;
  close(): Promise<void>;
}

/** HLC node id of writes made by the server. */
export const SERVER_HLC_NODE = 'server';

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Files of a user: the collection (`<id>.sqlite`, SQLite Repository) and the server-only sync
 * tables (`<id>.server.sqlite`). Separate files keep the two `node:sqlite` connections from ever
 * waiting on each other's write lock (both run on the same thread).
 */
export function userDbPaths(
  dataDir: string,
  userId: string,
): { collection: string; server: string } {
  if (!USER_ID_RE.test(userId)) throw new Error('Invalid user id');
  const base = join(dataDir, 'users', userId);
  return { collection: `${base}.sqlite`, server: `${base}.server.sqlite` };
}

/**
 * Opens user collections lazily and keeps them open. Operations of one user are serialized
 * through `withLock` so concurrent requests (two devices syncing) never interleave writes.
 */
export class CollectionRegistry {
  private readonly open = new Map<string, Promise<UserCollection>>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dataDir: string,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {
    mkdirSync(join(dataDir, 'users'), { recursive: true });
  }

  get(userId: string): Promise<UserCollection> {
    let c = this.open.get(userId);
    if (!c) {
      c = this.openCollection(userId);
      this.open.set(userId, c);
      c.catch(() => this.open.delete(userId));
    }
    return c;
  }

  /** Runs `fn` with exclusive access to the user's collection. */
  async withLock<T>(userId: string, fn: (c: UserCollection) => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => fn(await this.get(userId)));
    this.locks.set(
      userId,
      run.catch(() => undefined),
    );
    return run;
  }

  private openCollection(userId: string): Promise<UserCollection> {
    const paths = userDbPaths(this.dataDir, userId);
    const db = new DatabaseSync(paths.server);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec(SYNC_DDL);
    const repo = openRepository(paths.collection);
    // Writes made by the server itself (API imports) are stamped like a device's writes.
    const ctx = createServiceContext({
      repo: withSyncStamps(repo, createHlcClock(this.clock, SERVER_HLC_NODE)),
      clock: this.clock,
      rng: cryptoRng,
      deviceTimeZone: this.timeZone,
    });
    return Promise.resolve({
      userId,
      repo,
      ctx,
      changeLog: new SqliteChangeLog(db),
      batches: new SqliteBatchRegistry(db, this.clock),
      media: new SqliteMediaBlobs(db, this.clock),
      close: async () => {
        await repo.close();
        if (db.isOpen) db.close();
      },
    });
  }

  /** Closes the collection and deletes its files (account deletion). */
  async destroy(userId: string): Promise<void> {
    await this.withLock(userId, async (c) => {
      await c.close();
    });
    this.open.delete(userId);
    this.locks.delete(userId);
    for (const path of Object.values(userDbPaths(this.dataDir, userId))) {
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        rmSync(`${path}${suffix}`, { force: true });
    }
  }

  async closeAll(): Promise<void> {
    const all = [...this.open.values()];
    this.open.clear();
    for (const c of all) await (await c).close();
  }
}
