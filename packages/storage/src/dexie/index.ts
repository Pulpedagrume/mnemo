import type { Repository } from '../repository';
import { bindTables, openMnemoDexie, type DexieRepositoryOptions } from './schema';
import { createDexieStores } from './stores';

export type { DexieRepositoryOptions } from './schema';

/**
 * IndexedDB repository (browser; `fake-indexeddb` in Node tests). `transaction` opens one Dexie
 * 'rw' transaction over every table and hands `fn` stores bound to it: all their writes commit
 * together, or are rolled back when `fn` throws. Inside `fn`, only await storage calls: awaiting
 * unrelated work (timers, network) lets IndexedDB auto-commit, after which the stores reject.
 */
export function createDexieRepository(options: DexieRepositoryOptions): Repository {
  const db = openMnemoDexie(options);
  const stores = createDexieStores(db, (body) =>
    db.transaction('rw', [db.media, db.mediaContent], body),
  );
  return {
    ...stores,
    transaction: (fn) =>
      db.transaction('rw', db.tables, (trans) =>
        fn(createDexieStores(bindTables(trans), (body) => body())),
      ),
    clear: () =>
      db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
      }),
    close: () => {
      db.close();
      return Promise.resolve();
    },
  };
}
