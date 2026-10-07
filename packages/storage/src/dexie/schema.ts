import Dexie, { type DexieOptions, type Table, type Transaction } from 'dexie';
import type {
  Card,
  Deck,
  Id,
  ImportBatch,
  Media,
  Note,
  NoteType,
  Preset,
  ReviewLog,
  SettingRow,
} from '@mnemo/core';

export interface MediaContentRecord {
  id: Id;
  data: Uint8Array;
}

/** Typed tables of the IndexedDB database. */
export interface MnemoTables {
  decks: Table<Deck, Id>;
  presets: Table<Preset, Id>;
  noteTypes: Table<NoteType, Id>;
  notes: Table<Note, Id>;
  cards: Table<Card, Id>;
  reviewLogs: Table<ReviewLog, Id>;
  media: Table<Media, Id>;
  mediaContent: Table<MediaContentRecord, Id>;
  settings: Table<SettingRow, string>;
  importBatches: Table<ImportBatch, Id>;
}

export type MnemoDexie = Dexie & MnemoTables;

/**
 * Tables bound to `trans`: requests go to that transaction explicitly instead of relying on
 * Dexie's zone tracking, which can be lost across some native `await` chains.
 */
export function bindTables(trans: Transaction): MnemoTables {
  return {
    decks: trans.table<Deck, Id>('decks'),
    presets: trans.table<Preset, Id>('presets'),
    noteTypes: trans.table<NoteType, Id>('noteTypes'),
    notes: trans.table<Note, Id>('notes'),
    cards: trans.table<Card, Id>('cards'),
    reviewLogs: trans.table<ReviewLog, Id>('reviewLogs'),
    media: trans.table<Media, Id>('media'),
    mediaContent: trans.table<MediaContentRecord, Id>('mediaContent'),
    settings: trans.table<SettingRow, string>('settings'),
    importBatches: trans.table<ImportBatch, Id>('importBatches'),
  };
}

/**
 * Schema history. Only indexed properties are listed (the first one is the primary key); every
 * other property is stored as-is. Booleans are not valid IndexedDB keys, so boolean filters
 * (suspended, leech, needsReview) and tombstones (`deletedAt`) are applied in JavaScript.
 *
 * Migrations: never edit a shipped version. Add a new entry, e.g.
 *   db.version(2).stores({ cards: 'id, noteId, deckId, [deckId+state], [deckId+due], newPosition,
 *     updatedAt, flag' }).upgrade(async (tx) => { await tx.table('cards').toCollection()
 *     .modify((card) => { card.flag ??= 0; }); });
 * Only tables whose indexes change need to be repeated; `null` deletes a table. Upgrades run in a
 * single versionchange transaction when an older database is opened.
 */
export const SCHEMA_V1: Readonly<Record<keyof MnemoTables, string>> = {
  decks: 'id, updatedAt',
  presets: 'id, updatedAt',
  noteTypes: 'id, updatedAt',
  notes: 'id, uid, deckId, noteTypeId, updatedAt, createdAt, *tags',
  cards: 'id, noteId, deckId, [deckId+state], [deckId+due], newPosition, updatedAt',
  reviewLogs: 'id, cardId, ts',
  media: 'id, sha256, updatedAt',
  mediaContent: 'id',
  settings: 'key',
  importBatches: 'id, createdAt',
};

/** v2: review log tombstones (`deletedAt`) are indexed for `ReviewLogStore.changedSince`. */
export const SCHEMA_V2: Readonly<Partial<Record<keyof MnemoTables, string>>> = {
  reviewLogs: 'id, cardId, ts, deletedAt',
};

export interface DexieRepositoryOptions {
  /** Database name; the app uses `DB_NAME`, tests a unique name per run. */
  name: string;
  /** IndexedDB factory, e.g. `fake-indexeddb` in Node tests. Defaults to the global one. */
  indexedDB?: DexieOptions['indexedDB'];
  /** IDBKeyRange implementation matching `indexedDB`. */
  IDBKeyRange?: DexieOptions['IDBKeyRange'];
}

export function openMnemoDexie(options: DexieRepositoryOptions): MnemoDexie {
  const dexieOptions: DexieOptions = {};
  if (options.indexedDB !== undefined) dexieOptions.indexedDB = options.indexedDB;
  if (options.IDBKeyRange !== undefined) dexieOptions.IDBKeyRange = options.IDBKeyRange;
  const db = new Dexie(options.name, dexieOptions);
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores(SCHEMA_V2);
  return db as MnemoDexie;
}
