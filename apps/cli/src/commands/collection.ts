import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { systemClock } from '@mnemo/core';
import { CollectionRegistry, LOCAL_USER_ID, type UserCollection } from '@mnemo/server';
import { ensureCollection } from '@mnemo/services';

export interface CollectionOptions {
  dataDir?: string;
  user?: string;
}

/**
 * Opens the collection used by `mnemo serve` (single-user: user "local") in DATA_DIR.
 * Writes go through the same stamping and change log as the server, so synced devices receive
 * them. Prefer stopping a running server first: SQLite handles concurrent access, but the
 * server's in-process ordering does not cover another process.
 */
export async function withCollection<T>(
  opts: CollectionOptions,
  fn: (c: UserCollection) => Promise<T>,
): Promise<T> {
  const dataDir = resolve(opts.dataDir ?? process.env.DATA_DIR ?? join(homedir(), '.mnemo'));
  const registry = new CollectionRegistry(
    dataDir,
    systemClock,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const c = await registry.get(opts.user ?? LOCAL_USER_ID);
  try {
    await ensureCollection(c.ctx, 'fr');
    return await fn(c);
  } finally {
    await c.close();
  }
}
