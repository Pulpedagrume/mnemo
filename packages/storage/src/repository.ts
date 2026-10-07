import type {
  Card,
  CardState,
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

/**
 * Generic store for synchronisable entities. Deletion is logical: `put` an entity with `deletedAt`.
 * Read methods skip tombstones unless stated otherwise.
 */
export interface EntityStore<T extends { id: Id }> {
  get(id: Id): Promise<T | undefined>;
  /** Same order as `ids`; missing or deleted entries are `undefined`. */
  getMany(ids: readonly Id[]): Promise<(T | undefined)[]>;
  put(entity: T): Promise<void>;
  putMany(entities: readonly T[]): Promise<void>;
  /** All non-deleted entities. */
  list(): Promise<T[]>;
  count(): Promise<number>;
  /** Entities (tombstones included) with `updatedAt > since`, oldest first. For sync and backup. */
  changedSince(since: number, limit?: number): Promise<T[]>;
  /** Physical deletion. Only for data that was never synced (undo) and maintenance. */
  purge(ids: readonly Id[]): Promise<void>;
}

export interface NoteSearch {
  deckIds?: readonly Id[];
  /** Notes having every listed tag (case-insensitive, `parent::child` matches `parent`). */
  tags?: readonly string[];
  noteTypeIds?: readonly Id[];
  /** Case- and accent-insensitive substring over fields, hints, explanation and tags. */
  text?: string;
  needsReview?: boolean;
  /** Notes with at least one card in this state / with this flag. */
  cardState?: CardState;
  suspended?: boolean;
  leech?: boolean;
  sort?: 'created' | 'updated';
  descending?: boolean;
  offset?: number;
  limit?: number;
}

export interface NoteSearchResult {
  notes: Note[];
  /** Total matches before offset/limit. */
  total: number;
}

export interface NoteStore extends EntityStore<Note> {
  findByUid(uid: string): Promise<Note | undefined>;
  byDeck(deckIds: readonly Id[]): Promise<Note[]>;
  search(query: NoteSearch): Promise<NoteSearchResult>;
  /** Distinct tags of non-deleted notes with their usage count, sorted by tag. */
  tagCounts(): Promise<{ tag: string; count: number }[]>;
}

export interface CardStore extends EntityStore<Card> {
  byNote(noteIds: readonly Id[]): Promise<Card[]>;
  byDeck(deckIds: readonly Id[]): Promise<Card[]>;
  /** Non-new, non-suspended cards in these decks with `due < before`, sorted by due. */
  dueBefore(deckIds: readonly Id[], before: number): Promise<Card[]>;
  /** New, non-suspended cards in these decks, sorted by newPosition then id. */
  newCards(deckIds: readonly Id[], limit: number): Promise<Card[]>;
  /** Highest newPosition in use, or -1. */
  maxNewPosition(): Promise<number>;
}

/** Review logs are append-only; `remove` exists only for undo. */
export interface ReviewLogStore {
  add(log: ReviewLog): Promise<void>;
  addMany(logs: readonly ReviewLog[]): Promise<void>;
  get(id: Id): Promise<ReviewLog | undefined>;
  remove(id: Id): Promise<void>;
  byCard(cardId: Id): Promise<ReviewLog[]>;
  /** Logs with `from <= ts < to`, sorted by ts. */
  between(from: number, to: number): Promise<ReviewLog[]>;
  count(): Promise<number>;
}

export interface MediaStore extends EntityStore<Media> {
  getBySha(sha256: string): Promise<Media | undefined>;
  putContent(id: Id, data: Uint8Array): Promise<void>;
  getContent(id: Id): Promise<Uint8Array | undefined>;
}

export interface SettingsStore {
  all(): Promise<SettingRow[]>;
  get(key: string): Promise<SettingRow | undefined>;
  put(row: SettingRow): Promise<void>;
}

export interface ImportBatchStore {
  get(id: Id): Promise<ImportBatch | undefined>;
  put(batch: ImportBatch): Promise<void>;
  /** Most recent first. */
  list(limit?: number): Promise<ImportBatch[]>;
}

export interface Stores {
  decks: EntityStore<Deck>;
  presets: EntityStore<Preset>;
  noteTypes: EntityStore<NoteType>;
  notes: NoteStore;
  cards: CardStore;
  reviewLogs: ReviewLogStore;
  media: MediaStore;
  settings: SettingsStore;
  importBatches: ImportBatchStore;
}

/**
 * Asynchronous persistence boundary. Implementations: Dexie (browser), SQLite (server/CLI),
 * memory (tests). All pass the same conformance suite (`@mnemo/storage/testing`).
 */
export interface Repository extends Stores {
  /**
   * Runs `fn` atomically: either every write inside commits or none does (when `fn` throws).
   * Inside `fn`, only use the repository passed as argument and avoid non-storage async work.
   */
  transaction<T>(fn: (tx: Stores) => Promise<T>): Promise<T>;
  /** Deletes every record (used by "restore backup"). */
  clear(): Promise<void>;
  close(): Promise<void>;
}
