import type { Id } from '@mnemo/core';
import type { EntityStore, Stores } from '@mnemo/storage';
import { changeKey, mergeChange, type ChangeData } from './merge';
import type { Change, ChangeKind } from './protocol';
import { deepEqual } from './util';

export interface ApplyResult {
  /** Merged versions of the entities whose stored state changed. */
  changed: Change[];
  /** Changes where local data overrode (part of) the incoming version. */
  conflicts: number;
}

type EntityKind = 'deck' | 'preset' | 'noteType' | 'note' | 'card' | 'media';

function entityStore(stores: Stores, kind: EntityKind): EntityStore<ChangeData<EntityKind>> {
  const map = {
    deck: stores.decks,
    preset: stores.presets,
    noteType: stores.noteTypes,
    note: stores.notes,
    card: stores.cards,
    media: stores.media,
  } as const;
  return map[kind];
}

const isEntityKind = (k: ChangeKind): k is EntityKind =>
  k !== 'reviewLog' && k !== 'setting' && k !== 'importBatch';

/** Reads the stored versions (tombstones included) of the entities touched by `changes`. */
async function loadCurrent(
  stores: Stores,
  changes: readonly Change[],
): Promise<Map<string, Change>> {
  const current = new Map<string, Change>();
  const ids = new Map<EntityKind, Set<Id>>();
  for (const c of changes) {
    const key = changeKey(c);
    if (current.has(key)) continue;
    if (isEntityKind(c.kind)) {
      const set = ids.get(c.kind) ?? new Set<Id>();
      set.add((c.data as { id: Id }).id);
      ids.set(c.kind, set);
      continue;
    }
    let data: Change['data'] | undefined;
    if (c.kind === 'reviewLog') data = await stores.reviewLogs.get(c.data.id);
    else if (c.kind === 'setting') data = await stores.settings.get(c.data.key);
    else data = await stores.importBatches.get(c.data.id);
    if (data !== undefined) current.set(key, { kind: c.kind, data } as Change);
  }
  for (const [kind, set] of ids) {
    const rows = await entityStore(stores, kind).getRaw([...set]);
    for (const data of rows) {
      if (data !== undefined) current.set(`${kind}:${data.id}`, { kind, data } as Change);
    }
  }
  return current;
}

async function write(stores: Stores, changes: readonly Change[]): Promise<void> {
  const byKind = new Map<ChangeKind, Change['data'][]>();
  for (const c of changes) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.data]);
  for (const [kind, rows] of byKind) {
    if (isEntityKind(kind)) {
      await entityStore(stores, kind).putMany(rows as ChangeData<EntityKind>[]);
    } else if (kind === 'reviewLog') {
      await stores.reviewLogs.addMany(rows as ChangeData<'reviewLog'>[]);
    } else if (kind === 'setting') {
      for (const r of rows as ChangeData<'setting'>[]) await stores.settings.put(r);
    } else {
      for (const r of rows as ChangeData<'importBatch'>[]) await stores.importBatches.put(r);
    }
  }
}

/**
 * Merges incoming changes into `stores` (docs/SYNC.md rules) and writes the entities whose state
 * changed. Pass raw (unstamped) stores, inside a transaction for atomicity. Idempotent.
 */
export async function applyChanges(
  stores: Stores,
  changes: readonly Change[],
): Promise<ApplyResult> {
  const current = await loadCurrent(stores, changes);
  const stored = new Map(current);
  let conflicts = 0;
  for (const c of changes) {
    const key = changeKey(c);
    const local = current.get(key)?.data;
    const { merged, conflict } = mergeChange(c.kind, local, c.data);
    if (conflict) conflicts++;
    current.set(key, { kind: c.kind, data: merged } as Change);
  }
  const changed = [...current]
    .filter(([key, c]) => !deepEqual(stored.get(key)?.data, c.data))
    .map(([, c]) => c);
  await write(stores, changed);
  return { changed, conflicts };
}
