import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { systemClock } from '@mnemo/core';
import { CollectionRegistry, LOCAL_USER_ID, type UserCollection } from '@mnemo/server';
import { ensureCollection } from '@mnemo/services';

/** Runs `fn` with exclusive access to the collection. Calls never interleave. */
export type OpenCollection = <T>(fn: (c: UserCollection) => Promise<T>) => Promise<T>;

export interface LocalCollectionOptions {
  /** Data directory of `mnemo serve` (default: $DATA_DIR or ~/.mnemo). */
  dataDir?: string;
  /** Collection owner (default: `local`, the single-user collection). */
  user?: string;
}

export interface LocalCollection {
  open: OpenCollection;
  dataDir: string;
  close(): Promise<void>;
}

export function resolveDataDir(dataDir?: string): string {
  return resolve(dataDir ?? process.env.DATA_DIR ?? join(homedir(), '.mnemo'));
}

/**
 * The collection served by `mnemo serve` (same files, same HLC stamping), kept open for the
 * lifetime of the MCP server. Every tool call goes through the registry lock, so concurrent
 * calls (HTTP mode) are serialized.
 */
export function localCollection(opts: LocalCollectionOptions = {}): LocalCollection {
  const dataDir = resolveDataDir(opts.dataDir);
  const user = opts.user ?? LOCAL_USER_ID;
  const registry = new CollectionRegistry(
    dataDir,
    systemClock,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  let ensured = false;
  const open: OpenCollection = (fn) =>
    registry.withLock(user, async (c) => {
      if (!ensured) {
        await ensureCollection(c.ctx, 'fr');
        ensured = true;
      }
      return fn(c);
    });
  return { open, dataDir, close: () => registry.closeAll() };
}
