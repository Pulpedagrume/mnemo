import type { Card, Note } from '@mnemo/core';
import type { CardStore, EntityStore, NoteSearch, NoteStore } from '../repository';
import { compileNoteFilter, foldText, type Synced } from '../query/match';
import { compareById, compareStrings } from '../query/order';
import { bool, IN_LIST, limitParam, list, type SqlValue, type SqliteDriver } from './driver';
import { CARDS, NOTES, parseAll, parseData, upsertSql, type TableSpec } from './tables';

/** Executes a synchronous body against the connection, as a promise (see `scheduler.ts`). */
export type Runner = <T>(body: (db: SqliteDriver) => T) => Promise<T>;

export function sqliteEntityStore<T extends Synced>(
  spec: TableSpec<T>,
  run: Runner,
): EntityStore<T> {
  const t = spec.name;
  const upsert = upsertSql(spec);
  const write = (db: SqliteDriver, e: T) => {
    db.run(upsert, e.id, e.updatedAt, e.deletedAt ?? null, ...spec.values(e), JSON.stringify(e));
    spec.afterWrite?.(db, e);
  };
  const byIds = (db: SqliteDriver, ids: readonly string[], liveOnly: boolean) => {
    if (ids.length === 0) return [];
    const live = liveOnly ? ' AND deletedAt IS NULL' : '';
    const rows = db.all(
      `SELECT id, data FROM ${t} WHERE id ${IN_LIST}${live}`,
      list([...new Set(ids)]),
    );
    const found = new Map(rows.map((row) => [String(row['id']), row]));
    return ids.map((id) => parseData<T>(found.get(id)));
  };
  return {
    get: (id) =>
      run((db) =>
        parseData<T>(db.get(`SELECT data FROM ${t} WHERE id = ? AND deletedAt IS NULL`, id)),
      ),
    getMany: (ids) => run((db) => byIds(db, ids, true)),
    getRaw: (ids) => run((db) => byIds(db, ids, false)),
    put: (entity) =>
      run((db) => {
        db.atomic(() => {
          write(db, entity);
        });
      }),
    putMany: (entities) =>
      run((db) => {
        db.atomic(() => {
          for (const e of entities) write(db, e);
        });
      }),
    list: () =>
      run((db) => parseAll<T>(db.all(`SELECT data FROM ${t} WHERE deletedAt IS NULL ORDER BY id`))),
    count: () =>
      run((db) => Number(db.get(`SELECT count(*) AS n FROM ${t} WHERE deletedAt IS NULL`)?.['n'])),
    changedSince: (since, limit) =>
      run((db) =>
        parseAll<T>(
          db.all(
            `SELECT data FROM ${t} WHERE updatedAt > ? ORDER BY updatedAt, id LIMIT ?`,
            since,
            limitParam(limit),
          ),
        ),
      ),
    purge: (ids) =>
      run((db) => {
        if (ids.length === 0) return;
        const idList = list(ids);
        db.atomic(() => {
          db.run(`DELETE FROM ${t} WHERE id ${IN_LIST}`, idList);
          spec.afterPurge?.(db, idList);
        });
      }),
  };
}

/** Builds the SQL filter of a search; every condition mirrors `compileNoteFilter` exactly. */
function searchWhere(query: NoteSearch): { where: string; params: SqlValue[] } {
  const where = ['n.deletedAt IS NULL'];
  const params: SqlValue[] = [];
  if (query.deckIds !== undefined) {
    where.push(`n.deckId ${IN_LIST}`);
    params.push(list(query.deckIds));
  }
  if (query.noteTypeIds !== undefined) {
    where.push(`n.noteTypeId ${IN_LIST}`);
    params.push(list(query.noteTypeIds));
  }
  if (query.needsReview !== undefined) {
    where.push('n.needsReview = ?');
    params.push(bool(query.needsReview));
  }
  const tags = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  for (const tag of tags) {
    // `parent` matches `parent` and `parent::…` (instr = 1 is an exact, byte-wise prefix test).
    where.push(
      'EXISTS (SELECT 1 FROM note_tags g WHERE g.noteId = n.id AND (g.tagLower = ? OR instr(g.tagLower, ?) = 1))',
    );
    params.push(tag, `${tag}::`);
  }
  const text = query.text === undefined ? '' : foldText(query.text.trim());
  if (text.length > 0) {
    where.push('instr(n.haystack, ?) > 0');
    params.push(text);
  }
  const cardFilters = ['c.deletedAt IS NULL'];
  if (query.cardState !== undefined) {
    cardFilters.push('c.state = ?');
    params.push(query.cardState);
  }
  if (query.suspended !== undefined) {
    cardFilters.push('c.suspended = ?');
    params.push(bool(query.suspended));
  }
  if (query.leech !== undefined) {
    cardFilters.push('c.leech = ?');
    params.push(bool(query.leech));
  }
  if (cardFilters.length > 1) {
    where.push(`n.id IN (SELECT c.noteId FROM cards c WHERE ${cardFilters.join(' AND ')})`);
  }
  return { where: where.join(' AND '), params };
}

/**
 * Search: SQL selects the matching (id, sort key) pairs, JavaScript sorts and paginates them with
 * the shared comparators, then only the page is loaded and re-checked with `compileNoteFilter`.
 */
function searchNotes(db: SqliteDriver, query: NoteSearch) {
  const { where, params } = searchWhere(query);
  const key = query.sort === 'updated' ? 'updatedAt' : 'createdAt';
  const keys = db
    .all(`SELECT n.id AS id, n.${key} AS k FROM notes n WHERE ${where}`, ...params)
    .map((row) => ({ id: String(row['id']), k: Number(row['k']) }));
  const dir = query.descending === true ? -1 : 1;
  keys.sort((a, b) => dir * (a.k - b.k || compareById(a, b)));
  const offset = Math.max(0, query.offset ?? 0);
  const end = query.limit === undefined ? undefined : offset + Math.max(0, query.limit);
  const page = keys.slice(offset, end).map((k) => k.id);
  if (page.length === 0) return { notes: [], total: keys.length };
  const rows = db.all(`SELECT id, data FROM notes WHERE id ${IN_LIST}`, list(page));
  const byId = new Map(rows.map((row) => [String(row['id']), row]));
  const keep = compileNoteFilter(query);
  const notes = page
    .map((id) => parseData<Note>(byId.get(id)))
    .filter((n): n is Note => n !== undefined && keep(n));
  return { notes, total: keys.length };
}

export function sqliteNoteStore(run: Runner): NoteStore {
  return {
    ...sqliteEntityStore(NOTES, run),
    findByUid: (uid) =>
      run((db) =>
        parseData<Note>(
          db.get('SELECT data FROM notes WHERE uid = ? AND deletedAt IS NULL ORDER BY id', uid),
        ),
      ),
    byDeck: (deckIds) =>
      run((db) =>
        parseAll<Note>(
          db.all(
            `SELECT data FROM notes WHERE deckId ${IN_LIST} AND deletedAt IS NULL ORDER BY id`,
            list(deckIds),
          ),
        ),
      ),
    search: (query) => run((db) => searchNotes(db, query)),
    tagCounts: () =>
      run((db) => {
        const rows = db.all(
          `SELECT g.tag AS tag, count(*) AS n FROM note_tags g JOIN notes n ON n.id = g.noteId
           WHERE n.deletedAt IS NULL GROUP BY g.tag`,
        );
        // Re-sorted by the shared comparator (UTF-16 order, not SQLite's UTF-8 byte order).
        const counts = rows.map((row) => ({ tag: String(row['tag']), count: Number(row['n']) }));
        return counts.sort((a, b) => compareStrings(a.tag, b.tag));
      }),
  };
}

export function sqliteCardStore(run: Runner): CardStore {
  return {
    ...sqliteEntityStore(CARDS, run),
    byNote: (noteIds) =>
      run((db) =>
        parseAll<Card>(
          db.all(
            `SELECT data FROM cards WHERE noteId ${IN_LIST} AND deletedAt IS NULL ORDER BY id`,
            list(noteIds),
          ),
        ),
      ),
    byDeck: (deckIds) =>
      run((db) =>
        parseAll<Card>(
          db.all(
            `SELECT data FROM cards WHERE deckId ${IN_LIST} AND deletedAt IS NULL ORDER BY id`,
            list(deckIds),
          ),
        ),
      ),
    dueBefore: (deckIds, before) =>
      run((db) =>
        parseAll<Card>(
          db.all(
            `SELECT data FROM cards WHERE deckId ${IN_LIST} AND due < ? AND state <> 'new'
             AND suspended = 0 AND deletedAt IS NULL ORDER BY due, id`,
            list(deckIds),
            before,
          ),
        ),
      ),
    newCards: (deckIds, limit) =>
      run((db) =>
        parseAll<Card>(
          db.all(
            `SELECT data FROM cards WHERE deckId ${IN_LIST} AND state = 'new' AND suspended = 0
             AND deletedAt IS NULL ORDER BY newPosition IS NULL, newPosition, id LIMIT ?`,
            list(deckIds),
            Math.max(0, limit),
          ),
        ),
      ),
    maxNewPosition: () =>
      run((db) => {
        const row = db.get('SELECT max(newPosition) AS m FROM cards WHERE deletedAt IS NULL');
        const max = row?.['m'];
        return max === null || max === undefined ? -1 : Number(max);
      }),
  };
}
