import type { Table } from 'dexie';
import type { Card, Id, Note } from '@mnemo/core';
import type { CardStore, EntityStore, NoteStore } from '../repository';
import { cardMatches, compileNoteFilter, hasCardFilter, isLive, type Synced } from '../query/match';
import { compareById, compareDue, compareNew, countTags, sortAndPage } from '../query/order';
import type { MnemoTables } from './schema';

const liveOrUndefined = <T extends Synced>(row: T | undefined): T | undefined =>
  row !== undefined && isLive(row) ? row : undefined;

/** Live rows whose single-valued index `index` is one of `values`, ordered by id. */
async function anyOfLive<T extends Synced>(
  table: Table<T, Id>,
  index: string,
  values: readonly string[],
): Promise<T[]> {
  if (values.length === 0) return [];
  const rows = await table
    .where(index)
    .anyOf([...values])
    .filter(isLive)
    .toArray();
  return rows.sort(compareById);
}

export function dexieEntityStore<T extends Synced>(table: Table<T, Id>): EntityStore<T> {
  return {
    get: async (id) => liveOrUndefined(await table.get(id)),
    getMany: async (ids) => (await table.bulkGet([...ids])).map(liveOrUndefined),
    getRaw: (ids) => table.bulkGet([...ids]),
    put: async (entity) => {
      await table.put(entity);
    },
    putMany: async (entities) => {
      await table.bulkPut([...entities]);
    },
    // Primary-key order, i.e. by id.
    list: async () => (await table.toArray()).filter(isLive),
    count: () => table.filter(isLive).count(),
    changedSince: (since, limit) => {
      // The index orders ties by primary key, matching `compareChanged`.
      const range = table.where('updatedAt').above(since);
      return (limit === undefined ? range : range.limit(Math.max(0, limit))).toArray();
    },
    purge: (ids) => table.bulkDelete([...ids]),
  };
}

async function searchNotes(db: MnemoTables, query: Parameters<NoteStore['search']>[0]) {
  let cardNoteIds: Set<Id> | undefined;
  if (hasCardFilter(query)) {
    const ids = new Set<Id>();
    // A card may live in another deck than its note, so every card is considered.
    await db.cards
      .filter((c) => cardMatches(c, query))
      .each((c) => {
        ids.add(c.noteId);
      });
    cardNoteIds = ids;
  }
  // Narrow the candidates with the most selective index available; filters are re-applied below.
  let candidates: (Note | undefined)[];
  if (query.deckIds !== undefined) {
    candidates =
      query.deckIds.length === 0
        ? []
        : await db.notes
            .where('deckId')
            .anyOf([...query.deckIds])
            .toArray();
  } else if (query.noteTypeIds !== undefined) {
    candidates =
      query.noteTypeIds.length === 0
        ? []
        : await db.notes
            .where('noteTypeId')
            .anyOf([...query.noteTypeIds])
            .toArray();
  } else if (cardNoteIds !== undefined) {
    candidates = await db.notes.bulkGet([...cardNoteIds]);
  } else {
    candidates = await db.notes.toArray();
  }
  const keep = compileNoteFilter(query, cardNoteIds);
  const matches = candidates.filter((n): n is Note => n !== undefined && keep(n));
  return sortAndPage(matches, query);
}

export function dexieNoteStore(db: MnemoTables): NoteStore {
  return {
    ...dexieEntityStore(db.notes),
    findByUid: (uid) => db.notes.where('uid').equals(uid).filter(isLive).first(),
    byDeck: (deckIds) => anyOfLive(db.notes, 'deckId', deckIds),
    search: (query) => searchNotes(db, query),
    tagCounts: async () => countTags(await db.notes.toArray()),
  };
}

export function dexieCardStore(db: MnemoTables): CardStore {
  const cards = db.cards;
  return {
    ...dexieEntityStore(cards),
    byNote: (noteIds) => anyOfLive(cards, 'noteId', noteIds),
    byDeck: (deckIds) => anyOfLive(cards, 'deckId', deckIds),
    dueBefore: async (deckIds, before) => {
      const out: Card[] = [];
      // Sequential awaits keep every request inside the ambient Dexie transaction, if any.
      for (const deckId of new Set(deckIds)) {
        const rows = await cards
          .where('[deckId+due]')
          .between([deckId, -Infinity], [deckId, before], true, false)
          .filter((c) => isLive(c) && c.state !== 'new' && !c.suspended)
          .toArray();
        out.push(...rows);
      }
      return out.sort(compareDue);
    },
    newCards: async (deckIds, limit) => {
      if (limit <= 0) return [];
      const out: Card[] = [];
      for (const deckId of new Set(deckIds)) {
        const rows = await cards
          .where('[deckId+state]')
          .equals([deckId, 'new'])
          .filter((c) => isLive(c) && !c.suspended)
          .toArray();
        out.push(...rows);
      }
      return out.sort(compareNew).slice(0, limit);
    },
    maxNewPosition: async () => {
      const top = await cards.orderBy('newPosition').reverse().filter(isLive).first();
      return top?.newPosition ?? -1;
    },
  };
}
