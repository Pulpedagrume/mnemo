import type { ImportBatch, Media, ReviewLog, SettingRow } from '@mnemo/core';
import type {
  ImportBatchStore,
  MediaStore,
  ReviewLogStore,
  SettingsStore,
  Stores,
} from '../repository';
import { logChangeTime } from '../query/order';
import { limitParam, type SqliteDriver } from './driver';
import { sqliteCardStore, sqliteEntityStore, sqliteNoteStore, type Runner } from './entities';
import { DECKS, MEDIA, NOTE_TYPES, PRESETS, parseAll, parseData } from './tables';

function reviewLogStore(run: Runner): ReviewLogStore {
  const write = (db: SqliteDriver, log: ReviewLog) => {
    db.run(
      'INSERT OR REPLACE INTO review_logs (id, cardId, ts, deletedAt, changedAt, data) VALUES (?, ?, ?, ?, ?, ?)',
      log.id,
      log.cardId,
      log.ts,
      log.deletedAt ?? null,
      logChangeTime(log),
      JSON.stringify(log),
    );
  };
  return {
    add: (log) =>
      run((db) => {
        write(db, log);
      }),
    addMany: (logs) =>
      run((db) => {
        db.atomic(() => {
          for (const log of logs) write(db, log);
        });
      }),
    get: (id) =>
      run((db) => parseData<ReviewLog>(db.get('SELECT data FROM review_logs WHERE id = ?', id))),
    remove: (id) =>
      run((db) => {
        db.run('DELETE FROM review_logs WHERE id = ?', id);
      }),
    byCard: (cardId) =>
      run((db) =>
        parseAll<ReviewLog>(
          db.all(
            'SELECT data FROM review_logs WHERE cardId = ? AND deletedAt IS NULL ORDER BY ts, id',
            cardId,
          ),
        ),
      ),
    between: (from, to) =>
      run((db) =>
        parseAll<ReviewLog>(
          db.all(
            'SELECT data FROM review_logs WHERE ts >= ? AND ts < ? AND deletedAt IS NULL ORDER BY ts, id',
            from,
            to,
          ),
        ),
      ),
    count: () =>
      run((db) =>
        Number(db.get('SELECT count(*) AS n FROM review_logs WHERE deletedAt IS NULL')?.['n']),
      ),
    changedSince: (since, limit) =>
      run((db) =>
        parseAll<ReviewLog>(
          db.all(
            'SELECT data FROM review_logs WHERE changedAt > ? ORDER BY changedAt, id LIMIT ?',
            since,
            limitParam(limit),
          ),
        ),
      ),
  };
}

function mediaStore(run: Runner): MediaStore {
  return {
    ...sqliteEntityStore(MEDIA, run),
    getBySha: (sha256) =>
      run((db) =>
        parseData<Media>(
          db.get(
            'SELECT data FROM media WHERE sha256 = ? AND deletedAt IS NULL ORDER BY id LIMIT 1',
            sha256,
          ),
        ),
      ),
    putContent: (id, data) =>
      run((db) => {
        db.run('INSERT OR REPLACE INTO media_content (id, bytes) VALUES (?, ?)', id, data);
      }),
    getContent: (id) =>
      run((db) => {
        const bytes = db.get('SELECT bytes FROM media_content WHERE id = ?', id)?.['bytes'];
        // A fresh Uint8Array (not a Buffer view) the caller may mutate freely.
        return bytes instanceof Uint8Array ? new Uint8Array(bytes) : undefined;
      }),
  };
}

function settingsStore(run: Runner): SettingsStore {
  return {
    all: () => run((db) => parseAll<SettingRow>(db.all('SELECT data FROM settings ORDER BY key'))),
    get: (key) =>
      run((db) => parseData<SettingRow>(db.get('SELECT data FROM settings WHERE key = ?', key))),
    put: (row) =>
      run((db) => {
        db.run(
          'INSERT OR REPLACE INTO settings (key, data) VALUES (?, ?)',
          row.key,
          JSON.stringify(row),
        );
      }),
  };
}

function importBatchStore(run: Runner): ImportBatchStore {
  return {
    get: (id) =>
      run((db) =>
        parseData<ImportBatch>(db.get('SELECT data FROM import_batches WHERE id = ?', id)),
      ),
    put: (batch) =>
      run((db) => {
        db.run(
          'INSERT OR REPLACE INTO import_batches (id, createdAt, data) VALUES (?, ?, ?)',
          batch.id,
          batch.createdAt,
          JSON.stringify(batch),
        );
      }),
    list: (limit) =>
      run((db) =>
        parseAll<ImportBatch>(
          db.all(
            'SELECT data FROM import_batches ORDER BY createdAt DESC, id DESC LIMIT ?',
            limitParam(limit),
          ),
        ),
      ),
  };
}

/** Every store, executing through `run` (the shared scheduler, or a transaction). */
export function createSqliteStores(run: Runner): Stores {
  return {
    decks: sqliteEntityStore(DECKS, run),
    presets: sqliteEntityStore(PRESETS, run),
    noteTypes: sqliteEntityStore(NOTE_TYPES, run),
    notes: sqliteNoteStore(run),
    cards: sqliteCardStore(run),
    reviewLogs: reviewLogStore(run),
    media: mediaStore(run),
    settings: settingsStore(run),
    importBatches: importBatchStore(run),
  };
}
