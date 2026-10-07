import type { Card, Deck, Media, Note, NoteType, Preset } from '@mnemo/core';
import { noteHaystack, type Synced } from '../query/match';
import { bool, IN_LIST, opt, type SqlValue, type SqliteDriver } from './driver';

/**
 * How a synchronisable entity maps to its table: the full entity goes to `data` (JSON), `columns`
 * are scalar copies used by queries. Hooks maintain side tables (note tags, media content).
 */
export interface TableSpec<T extends Synced> {
  name: string;
  columns: readonly string[];
  values: (entity: T) => SqlValue[];
  afterWrite?: (db: SqliteDriver, entity: T) => void;
  /** `idList` is a JSON array, to be used with `IN_LIST`. */
  afterPurge?: (db: SqliteDriver, idList: string) => void;
}

const plain = <T extends Synced>(name: string): TableSpec<T> => ({
  name,
  columns: [],
  values: () => [],
});

export const DECKS: TableSpec<Deck> = plain('decks');
export const PRESETS: TableSpec<Preset> = plain('presets');
export const NOTE_TYPES: TableSpec<NoteType> = plain('note_types');

export const NOTES: TableSpec<Note> = {
  name: 'notes',
  columns: ['createdAt', 'deckId', 'noteTypeId', 'uid', 'needsReview', 'haystack'],
  values: (n) => [
    n.createdAt,
    n.deckId,
    n.noteTypeId,
    opt(n.uid),
    bool(n.needsReview),
    noteHaystack(n),
  ],
  afterWrite: (db, n) => {
    db.run('DELETE FROM note_tags WHERE noteId = ?', n.id);
    for (const tag of new Set(n.tags)) {
      db.run(
        'INSERT INTO note_tags (noteId, tag, tagLower) VALUES (?, ?, ?)',
        n.id,
        tag,
        tag.toLowerCase(),
      );
    }
  },
  afterPurge: (db, idList) => {
    db.run(`DELETE FROM note_tags WHERE noteId ${IN_LIST}`, idList);
  },
};

export const CARDS: TableSpec<Card> = {
  name: 'cards',
  columns: ['noteId', 'deckId', 'state', 'due', 'newPosition', 'suspended', 'leech'],
  values: (c) => [
    c.noteId,
    c.deckId,
    c.state,
    c.due,
    opt(c.newPosition),
    bool(c.suspended),
    bool(c.leech),
  ],
};

export const MEDIA: TableSpec<Media> = {
  name: 'media',
  columns: ['sha256'],
  values: (m) => [m.sha256],
  afterPurge: (db, idList) => {
    db.run(`DELETE FROM media_content WHERE id ${IN_LIST}`, idList);
  },
};

/** `INSERT OR REPLACE` statement of a table spec. */
export function upsertSql<T extends Synced>(spec: TableSpec<T>): string {
  const columns = ['id', 'updatedAt', 'deletedAt', ...spec.columns, 'data'];
  const marks = columns.map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${spec.name} (${columns.join(', ')}) VALUES (${marks})`;
}

/** Parses the JSON `data` column of a row into a fresh object. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed decode of trusted rows we wrote
export function parseData<T>(row: Record<string, unknown> | undefined): T | undefined {
  return row === undefined ? undefined : (JSON.parse(String(row['data'])) as T);
}

export function parseAll<T>(rows: readonly Record<string, unknown>[]): T[] {
  return rows.map((row) => JSON.parse(String(row['data'])) as T);
}
