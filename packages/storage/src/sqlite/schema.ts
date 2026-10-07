/**
 * SQLite schema history. Every table stores the full entity as JSON in `data`; the other columns
 * are copies of the scalar properties that queries filter or sort on (see `tables.ts`, which
 * computes them on write).
 *
 * Adding a migration: never edit a shipped entry. Append a new function to `MIGRATIONS`, e.g.
 *   (db) => {
 *     db.exec('ALTER TABLE cards ADD COLUMN flag INTEGER NOT NULL DEFAULT 0');
 *     db.exec("UPDATE cards SET flag = coalesce(json_extract(data, '$.flag'), 0)");
 *   },
 * Migration N (1-based) runs once, in its own transaction, when `PRAGMA user_version` is below N;
 * the version is bumped in the same transaction, so a failed migration leaves the database
 * untouched. If a new column is derived from the entity, also update `tables.ts`.
 */
export interface MigrationTarget {
  exec(sql: string): void;
  get(sql: string): Record<string, unknown> | undefined;
}

type Migration = (db: MigrationTarget) => void;

/** Columns shared by synchronisable entity tables. */
const SYNCED = 'id TEXT PRIMARY KEY NOT NULL, updatedAt REAL NOT NULL, deletedAt REAL';

const V1 = `
CREATE TABLE decks (${SYNCED}, data TEXT NOT NULL);
CREATE INDEX decks_updated ON decks (updatedAt, id);

CREATE TABLE presets (${SYNCED}, data TEXT NOT NULL);
CREATE INDEX presets_updated ON presets (updatedAt, id);

CREATE TABLE note_types (${SYNCED}, data TEXT NOT NULL);
CREATE INDEX note_types_updated ON note_types (updatedAt, id);

CREATE TABLE notes (
  ${SYNCED},
  createdAt REAL NOT NULL,
  deckId TEXT NOT NULL,
  noteTypeId TEXT NOT NULL,
  uid TEXT,
  needsReview INTEGER NOT NULL,
  haystack TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX notes_updated ON notes (updatedAt, id);
CREATE INDEX notes_created ON notes (createdAt, id);
CREATE INDEX notes_deck ON notes (deckId);
CREATE INDEX notes_type ON notes (noteTypeId);
CREATE INDEX notes_uid ON notes (uid) WHERE uid IS NOT NULL;

-- One row per distinct tag of a note (tombstones included; queries join on live notes).
CREATE TABLE note_tags (
  noteId TEXT NOT NULL,
  tag TEXT NOT NULL,
  tagLower TEXT NOT NULL,
  PRIMARY KEY (noteId, tag)
) WITHOUT ROWID;
CREATE INDEX note_tags_lower ON note_tags (tagLower);

CREATE TABLE cards (
  ${SYNCED},
  noteId TEXT NOT NULL,
  deckId TEXT NOT NULL,
  state TEXT NOT NULL,
  due REAL NOT NULL,
  newPosition REAL,
  suspended INTEGER NOT NULL,
  leech INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX cards_updated ON cards (updatedAt, id);
CREATE INDEX cards_note ON cards (noteId);
CREATE INDEX cards_deck_due ON cards (deckId, due);
CREATE INDEX cards_deck_state ON cards (deckId, state, newPosition);
CREATE INDEX cards_new_position ON cards (newPosition) WHERE newPosition IS NOT NULL;

CREATE TABLE review_logs (
  id TEXT PRIMARY KEY NOT NULL,
  cardId TEXT NOT NULL,
  ts REAL NOT NULL,
  deletedAt REAL,
  -- Sync change time: max(ts, deletedAt ?? 0) (see logChangeTime).
  changedAt REAL NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX review_logs_changed ON review_logs (changedAt, id);
CREATE INDEX review_logs_card ON review_logs (cardId, ts, id);
CREATE INDEX review_logs_ts ON review_logs (ts, id);

CREATE TABLE media (${SYNCED}, sha256 TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX media_updated ON media (updatedAt, id);
CREATE INDEX media_sha ON media (sha256);

CREATE TABLE media_content (id TEXT PRIMARY KEY NOT NULL, bytes BLOB NOT NULL);

CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);

CREATE TABLE import_batches (id TEXT PRIMARY KEY NOT NULL, createdAt REAL NOT NULL, data TEXT NOT NULL);
CREATE INDEX import_batches_created ON import_batches (createdAt, id);
`;

export const MIGRATIONS: readonly Migration[] = [
  (db) => {
    db.exec(V1);
  },
];

/** Every table, in a safe order for `clear()`. */
export const ALL_TABLES = [
  'decks',
  'presets',
  'note_types',
  'notes',
  'note_tags',
  'cards',
  'review_logs',
  'media',
  'media_content',
  'settings',
  'import_batches',
] as const;

function userVersion(db: MigrationTarget): number {
  const row = db.get('PRAGMA user_version');
  return Number(row?.['user_version'] ?? 0);
}

/** Brings the database to the latest schema version. Idempotent. */
export function migrate(db: MigrationTarget, migrations: readonly Migration[] = MIGRATIONS): void {
  const current = userVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `Database schema version ${String(current)} is newer than this build (${String(migrations.length)})`,
    );
  }
  for (let version = current + 1; version <= migrations.length; version++) {
    const step = migrations[version - 1];
    if (step === undefined) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      step(db);
      db.exec(`PRAGMA user_version = ${String(version)}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
