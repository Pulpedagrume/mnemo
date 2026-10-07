import type {
  ImportBatchStore,
  MediaStore,
  ReviewLogStore,
  SettingsStore,
  Stores,
} from '../repository';
import { isLive } from '../query/match';
import { applyLimit, compareBatchesDesc, compareLogs, compareStrings } from '../query/order';
import { memoryCardStore, memoryEntityStore, memoryNoteStore } from './entities';
import { clone, run, type MemoryState } from './state';
import type { Journal } from './table';

function reviewLogStore(state: MemoryState, journal: Journal | undefined): ReviewLogStore {
  const table = state.reviewLogs;
  return {
    add: (log) =>
      run(() => {
        table.put(clone(log), journal);
      }),
    addMany: (logs) =>
      run(() => {
        logs.forEach((log) => {
          table.put(clone(log), journal);
        });
      }),
    get: (id) => run(() => clone(table.get(id))),
    remove: (id) =>
      run(() => {
        table.delete(id, journal);
      }),
    byCard: (cardId) => run(() => table.lookup('cardId', cardId).sort(compareLogs).map(clone)),
    between: (from, to) =>
      run(() =>
        [...table.values()]
          .filter((l) => l.ts >= from && l.ts < to)
          .sort(compareLogs)
          .map(clone),
      ),
    count: () => run(() => table.size),
  };
}

function mediaStore(state: MemoryState, journal: Journal | undefined): MediaStore {
  const content = state.mediaContent;
  return {
    ...memoryEntityStore(state.media, journal, (id) => {
      content.delete(id, journal);
    }),
    getBySha: (sha256) =>
      run(() => {
        const live = state.media.lookup('sha256', sha256).filter(isLive);
        live.sort((a, b) => compareStrings(a.id, b.id));
        return clone(live[0]);
      }),
    putContent: (id, data) =>
      run(() => {
        content.put({ id, data: data.slice() }, journal);
      }),
    getContent: (id) => run(() => content.get(id)?.data.slice()),
  };
}

function settingsStore(state: MemoryState, journal: Journal | undefined): SettingsStore {
  const table = state.settings;
  return {
    all: () =>
      run(() => [...table.values()].sort((a, b) => compareStrings(a.key, b.key)).map(clone)),
    get: (key) => run(() => clone(table.get(key))),
    put: (row) =>
      run(() => {
        table.put(clone(row), journal);
      }),
  };
}

function importBatchStore(state: MemoryState, journal: Journal | undefined): ImportBatchStore {
  const table = state.importBatches;
  return {
    get: (id) => run(() => clone(table.get(id))),
    put: (batch) =>
      run(() => {
        table.put(clone(batch), journal);
      }),
    list: (limit) =>
      run(() => applyLimit([...table.values()].sort(compareBatchesDesc), limit).map(clone)),
  };
}

/** Stores over `state`; writes are recorded in `journal` when running inside a transaction. */
export function createMemoryStores(state: MemoryState, journal?: Journal): Stores {
  return {
    decks: memoryEntityStore(state.decks, journal),
    presets: memoryEntityStore(state.presets, journal),
    noteTypes: memoryEntityStore(state.noteTypes, journal),
    notes: memoryNoteStore(state, journal),
    cards: memoryCardStore(state, journal),
    reviewLogs: reviewLogStore(state, journal),
    media: mediaStore(state, journal),
    settings: settingsStore(state, journal),
    importBatches: importBatchStore(state, journal),
  };
}
