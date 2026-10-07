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
import { MemTable } from './table';

export interface MediaContentRow {
  id: Id;
  data: Uint8Array;
}

/** Every table of the in-memory repository. */
export type MemoryState = {
  decks: MemTable<Deck>;
  presets: MemTable<Preset>;
  noteTypes: MemTable<NoteType>;
  notes: MemTable<Note>;
  cards: MemTable<Card>;
  reviewLogs: MemTable<ReviewLog>;
  media: MemTable<Media>;
  mediaContent: MemTable<MediaContentRow>;
  settings: MemTable<SettingRow>;
  importBatches: MemTable<ImportBatch>;
};

const byId = (row: { id: Id }): string => row.id;

export function createMemoryState(): MemoryState {
  return {
    decks: new MemTable<Deck>('decks', byId),
    presets: new MemTable<Preset>('presets', byId),
    noteTypes: new MemTable<NoteType>('noteTypes', byId),
    notes: new MemTable<Note>('notes', byId, {
      uid: (n) => (n.uid === undefined ? [] : [n.uid]),
      deckId: (n) => [n.deckId],
    }),
    cards: new MemTable<Card>('cards', byId, {
      noteId: (c) => [c.noteId],
      deckId: (c) => [c.deckId],
    }),
    reviewLogs: new MemTable<ReviewLog>('reviewLogs', byId, { cardId: (l) => [l.cardId] }),
    media: new MemTable<Media>('media', byId, { sha256: (m) => [m.sha256] }),
    mediaContent: new MemTable<MediaContentRow>('mediaContent', byId),
    settings: new MemTable<SettingRow>('settings', (row) => row.key),
    importBatches: new MemTable<ImportBatch>('importBatches', byId),
  };
}

export function clearMemoryState(state: MemoryState): void {
  for (const table of Object.values(state)) table.clear();
}

/** Deep copy so callers can never mutate stored state (and vice versa). */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Runs a synchronous body as a promise; a thrown error becomes a rejection. */
export function run<T>(body: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(body());
  });
}
