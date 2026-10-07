import type { Card, Id, Note } from '@mnemo/core';
import type { CardStore, EntityStore, NoteStore } from '../repository';
import {
  compileNoteFilter,
  hasCardFilter,
  isLive,
  matchingCardNoteIds,
  type Synced,
} from '../query/match';
import {
  compareById,
  compareChanged,
  compareDue,
  compareNew,
  countTags,
  sortAndPage,
} from '../query/order';
import { clone, run, type MemoryState } from './state';
import type { Journal, MemTable } from './table';

/** Live rows of `table` found through `index` for each value, deduplicated, ordered by id. */
function lookupLive<T extends Synced>(
  table: MemTable<T>,
  index: string,
  values: readonly string[],
) {
  const seen = new Map<Id, T>();
  for (const value of new Set(values)) {
    for (const row of table.lookup(index, value)) if (isLive(row)) seen.set(row.id, row);
  }
  return [...seen.values()].sort(compareById);
}

export function memoryEntityStore<T extends Synced>(
  table: MemTable<T>,
  journal: Journal | undefined,
  onPurge?: (id: Id) => void,
): EntityStore<T> {
  const live = (id: Id): T | undefined => {
    const row = table.get(id);
    return row !== undefined && isLive(row) ? row : undefined;
  };
  const write = (entity: T) => {
    table.put(clone(entity), journal);
  };
  return {
    get: (id) => run(() => clone(live(id))),
    getMany: (ids) => run(() => ids.map((id) => clone(live(id)))),
    put: (entity) =>
      run(() => {
        write(entity);
      }),
    putMany: (entities) =>
      run(() => {
        entities.forEach(write);
      }),
    list: () => run(() => [...table.values()].filter(isLive).sort(compareById).map(clone)),
    count: () =>
      run(() => {
        let n = 0;
        for (const row of table.values()) if (isLive(row)) n++;
        return n;
      }),
    changedSince: (since, limit) =>
      run(() => {
        const rows = [...table.values()].filter((r) => r.updatedAt > since).sort(compareChanged);
        return (limit === undefined ? rows : rows.slice(0, Math.max(0, limit))).map(clone);
      }),
    purge: (ids) =>
      run(() => {
        for (const id of ids) {
          table.delete(id, journal);
          onPurge?.(id);
        }
      }),
  };
}

export function memoryNoteStore(state: MemoryState, journal: Journal | undefined): NoteStore {
  const table = state.notes;
  return {
    ...memoryEntityStore(table, journal),
    findByUid: (uid) => run(() => clone(lookupLive(table, 'uid', [uid])[0])),
    byDeck: (deckIds) => run(() => lookupLive(table, 'deckId', deckIds).map(clone)),
    search: (query) =>
      run(() => {
        const cardNoteIds = hasCardFilter(query)
          ? matchingCardNoteIds(state.cards.values(), query)
          : undefined;
        const candidates: Iterable<Note> =
          query.deckIds === undefined ? table.values() : lookupLive(table, 'deckId', query.deckIds);
        const matches = [...candidates].filter(compileNoteFilter(query, cardNoteIds));
        const result = sortAndPage(matches, query);
        return { notes: result.notes.map(clone), total: result.total };
      }),
    tagCounts: () => run(() => countTags(table.values())),
  };
}

export function memoryCardStore(state: MemoryState, journal: Journal | undefined): CardStore {
  const table = state.cards;
  const isNew = (c: Card) => c.state === 'new';
  return {
    ...memoryEntityStore(table, journal),
    byNote: (noteIds) => run(() => lookupLive(table, 'noteId', noteIds).map(clone)),
    byDeck: (deckIds) => run(() => lookupLive(table, 'deckId', deckIds).map(clone)),
    dueBefore: (deckIds, before) =>
      run(() =>
        lookupLive(table, 'deckId', deckIds)
          .filter((c) => !isNew(c) && !c.suspended && c.due < before)
          .sort(compareDue)
          .map(clone),
      ),
    newCards: (deckIds, limit) =>
      run(() =>
        lookupLive(table, 'deckId', deckIds)
          .filter((c) => isNew(c) && !c.suspended)
          .sort(compareNew)
          .slice(0, Math.max(0, limit))
          .map(clone),
      ),
    maxNewPosition: () =>
      run(() => {
        let max = -1;
        for (const c of table.values()) {
          if (isLive(c) && c.newPosition !== undefined && c.newPosition > max) max = c.newPosition;
        }
        return max;
      }),
  };
}
