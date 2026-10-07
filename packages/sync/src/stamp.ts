import type { Id, SettingRow, SyncMeta } from '@mnemo/core';
import type { EntityStore, Repository, Stores } from '@mnemo/storage';
import type { HlcClock } from './hlc';
import { BASE_CLOCK, MAP_FIELDS, compactMeta, pathHlc, pathValue, trackedPaths } from './paths';
import { deepEqual, type Json } from './util';

/** Settings keys reserved for the sync engine itself: never stamped, never pushed. */
export const SYNC_SETTINGS_PREFIX = 'sync.';

/**
 * Sync metadata of `next` replacing `old`: paths (fields, or note field entries) that differ get
 * `now`, the others keep their previous clock, and so does the base clock (see paths.ts). Keeps
 * the old metadata when nothing changed, so rewriting an identical entity creates no change.
 * `maps`: map fields tracked per entry (see paths.ts).
 */
export function stampEntity<T extends object>(
  old: T | undefined,
  next: T,
  now: () => string,
  maps: readonly string[] = [],
): T {
  const n = { ...next } as Json;
  delete n['sync'];
  if (old === undefined) return { ...n, sync: { hlc: now() } } as T;
  const o = old as Json;
  const paths = new Set([...trackedPaths(o, maps), ...trackedPaths(n, maps)]);
  const changed = new Set(
    [...paths].filter((p) => !deepEqual(pathValue(o, p, maps), pathValue(n, p, maps))),
  );
  const oldMeta = o['sync'] as SyncMeta | undefined;
  if (changed.size === 0 && o['deletedAt'] === n['deletedAt'] && oldMeta !== undefined) {
    return { ...n, sync: oldMeta } as T;
  }
  const hlc = now();
  const clocks: Record<string, string> = {};
  for (const p of [BASE_CLOCK, ...maps, ...paths]) {
    clocks[p] = changed.has(p) ? hlc : pathHlc(o, p, maps);
  }
  return { ...n, sync: compactMeta(hlc, clocks, maps) } as T;
}

/** Proxy of `target` where `patch` replaces some methods; other members are bound to `target`. */
function override<T extends object>(target: T, patch: Partial<T>): T {
  return new Proxy(target, {
    get(t, p) {
      if (p in patch) return (patch as Record<string | symbol, unknown>)[p];
      const v: unknown = Reflect.get(t, p, t);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

function stampedEntityStore<T extends { id: Id }, S extends EntityStore<T>>(
  store: S,
  hlc: HlcClock,
  maps: readonly string[] = [],
): S {
  const now = () => hlc.now();
  const putMany = async (entities: readonly T[]): Promise<void> => {
    if (entities.length === 0) return;
    const olds = await store.getRaw(entities.map((e) => e.id));
    const byId = new Map<Id, T>();
    olds.forEach((o) => {
      if (o) byId.set(o.id, o);
    });
    const stamped = entities.map((e) => {
      const s = stampEntity(byId.get(e.id), e, now, maps);
      byId.set(e.id, s);
      return s;
    });
    await store.putMany(stamped);
  };
  return override(store, {
    put: (entity: T) => putMany([entity]),
    putMany,
  } as Partial<S>);
}

function stampStores(stores: Stores, hlc: HlcClock): Stores {
  const now = () => hlc.now();
  const { reviewLogs, settings, importBatches } = stores;
  return {
    decks: stampedEntityStore(stores.decks, hlc),
    presets: stampedEntityStore(stores.presets, hlc),
    noteTypes: stampedEntityStore(stores.noteTypes, hlc),
    notes: stampedEntityStore(stores.notes, hlc, MAP_FIELDS['note']),
    cards: stampedEntityStore(stores.cards, hlc),
    media: stampedEntityStore(stores.media, hlc),
    importBatches: override(importBatches, {
      put: async (batch) => {
        await importBatches.put(stampEntity(await importBatches.get(batch.id), batch, now));
      },
    }),
    reviewLogs: override(reviewLogs, {
      add: async (log) => {
        await reviewLogs.add(stampEntity(await reviewLogs.get(log.id), log, now));
      },
      addMany: async (logs) => {
        const stamped = [];
        for (const log of logs) {
          stamped.push(stampEntity(await reviewLogs.get(log.id), log, now));
        }
        await reviewLogs.addMany(stamped);
      },
    }),
    settings: override(settings, {
      put: async (row: SettingRow) => {
        if (row.key.startsWith(SYNC_SETTINGS_PREFIX)) return settings.put(row);
        await settings.put({ ...row, hlc: hlc.now() });
      },
    }),
  };
}

/**
 * Repository decorator that stamps every write with hybrid logical clocks (docs/SYNC.md):
 * `sync.hlc` for the entity, `sync.fields` for each changed top-level field, `hlc` for settings.
 * Services use the decorated repository; the sync engine writes merged remote data through the
 * raw one so it is never re-stamped.
 */
export function withSyncStamps(repo: Repository, hlc: HlcClock): Repository {
  const stamped = stampStores(repo, hlc);
  return override(repo, {
    ...stamped,
    transaction: <T>(fn: (tx: Stores) => Promise<T>) =>
      repo.transaction((tx) => fn(stampStores(tx, hlc))),
  });
}
