import type {
  ImportBatchStore,
  MediaStore,
  ReviewLogStore,
  SettingsStore,
  Stores,
} from '../repository';
import { isLive } from '../query/match';
import { compareLogs } from '../query/order';
import { dexieCardStore, dexieEntityStore, dexieNoteStore } from './entities';
import type { MnemoTables } from './schema';

/** Runs `body` atomically (a nested Dexie transaction, or directly inside one). */
export type Atomic = (body: () => Promise<void>) => Promise<void>;

function reviewLogStore(db: MnemoTables): ReviewLogStore {
  const logs = db.reviewLogs;
  return {
    add: async (log) => {
      await logs.put(log);
    },
    addMany: async (items) => {
      await logs.bulkPut([...items]);
    },
    get: (id) => logs.get(id),
    remove: (id) => logs.delete(id),
    byCard: async (cardId) =>
      (await logs.where('cardId').equals(cardId).toArray()).sort(compareLogs),
    // Index order is ts then primary key, matching `compareLogs`.
    between: (from, to) =>
      from < to ? logs.where('ts').between(from, to, true, false).toArray() : Promise.resolve([]),
    count: () => logs.count(),
  };
}

function mediaStore(db: MnemoTables, atomic: Atomic): MediaStore {
  return {
    ...dexieEntityStore(db.media),
    // Metadata and content are purged atomically.
    purge: (ids) =>
      atomic(async () => {
        await db.media.bulkDelete([...ids]);
        await db.mediaContent.bulkDelete([...ids]);
      }),
    getBySha: (sha256) => db.media.where('sha256').equals(sha256).filter(isLive).first(),
    putContent: async (id, data) => {
      await db.mediaContent.put({ id, data });
    },
    getContent: async (id) => (await db.mediaContent.get(id))?.data,
  };
}

function settingsStore(db: MnemoTables): SettingsStore {
  return {
    // Primary-key order, i.e. by key.
    all: () => db.settings.toArray(),
    get: (key) => db.settings.get(key),
    put: async (row) => {
      await db.settings.put(row);
    },
  };
}

function importBatchStore(db: MnemoTables): ImportBatchStore {
  return {
    get: (id) => db.importBatches.get(id),
    put: async (batch) => {
      await db.importBatches.put(batch);
    },
    // Reverse index order: createdAt descending, ties by id descending.
    list: (limit) => {
      const all = db.importBatches.orderBy('createdAt').reverse();
      return (limit === undefined ? all : all.limit(Math.max(0, limit))).toArray();
    },
  };
}

/** Stores over `db`: the database itself, or tables bound to a transaction (see `bindTables`). */
export function createDexieStores(db: MnemoTables, atomic: Atomic): Stores {
  return {
    decks: dexieEntityStore(db.decks),
    presets: dexieEntityStore(db.presets),
    noteTypes: dexieEntityStore(db.noteTypes),
    notes: dexieNoteStore(db),
    cards: dexieCardStore(db),
    reviewLogs: reviewLogStore(db),
    media: mediaStore(db, atomic),
    settings: settingsStore(db),
    importBatches: importBatchStore(db),
  };
}
