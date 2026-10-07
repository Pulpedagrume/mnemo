import type { SettingRow } from '@mnemo/core';
import { compareEncoded, hlcFromMillis, maxEncoded } from './hlc';
import {
  BASE_CLOCK,
  compactMeta,
  entityHlc,
  mapFieldsOf,
  pathHlc,
  pathValue,
  setPath,
  trackedPaths,
} from './paths';
import type { Change, ChangeKind } from './protocol';
import { deepEqual, stableStringify, type Json } from './util';

/**
 * Merge rules of docs/SYNC.md, shared by clients and server. Every function here is a join of a
 * semilattice: commutative, associative and idempotent, so replicas converge whatever the order
 * in which they receive changes.
 */

export type ChangeData<K extends ChangeKind = ChangeKind> = Extract<Change, { kind: K }>['data'];

export { entityHlc } from './paths';

/** Card fields that move together: the state of the most recent review wins. */
export const SCHEDULING_FIELDS = [
  'state',
  'due',
  'interval',
  'ease',
  'stability',
  'difficulty',
  'reps',
  'lapses',
  'step',
  'box',
  'lastReview',
  'schedulerData',
] as const;

/** HLC of the last write of a top-level `field`, falling back to the entity HLC. */
export function fieldHlc(e: Json, field: string): string {
  return pathHlc(e, field);
}

/** Lexicographic join of (clock, value): the later clock wins, ties broken by value. */
function pickByClock(ca: string, va: unknown, cb: string, vb: unknown): 'a' | 'b' {
  const c = compareEncoded(ca, cb);
  if (c !== 0) return c > 0 ? 'a' : 'b';
  return stableStringify(va) >= stableStringify(vb) ? 'a' : 'b';
}

function minDefined(a: unknown, b: unknown): number | undefined {
  const xs = [a, b].filter((v): v is number => typeof v === 'number');
  return xs.length ? Math.min(...xs) : undefined;
}

function maxDefined(a: unknown, b: unknown): number | undefined {
  const xs = [a, b].filter((v): v is number => typeof v === 'number');
  return xs.length ? Math.max(...xs) : undefined;
}

function cardGroupKey(e: Json): { review: number; clock: string; value: string } {
  const lr = e['lastReview'];
  let clock = '';
  for (const f of SCHEDULING_FIELDS) clock = maxEncoded(clock, fieldHlc(e, f));
  // Values and clocks: a total order on scheduling states, so ties never depend on argument order.
  const value = stableStringify(SCHEDULING_FIELDS.map((f) => [e[f], fieldHlc(e, f)]));
  return { review: typeof lr === 'number' ? lr : -1, clock, value };
}

/** Which side holds the scheduling state to keep: latest review, then latest clock. */
function pickCardGroup(a: Json, b: Json): Json {
  const ka = cardGroupKey(a);
  const kb = cardGroupKey(b);
  if (ka.review !== kb.review) return ka.review > kb.review ? a : b;
  const c = compareEncoded(ka.clock, kb.clock);
  if (c !== 0) return c > 0 ? a : b;
  return ka.value >= kb.value ? a : b;
}

/** Field-level LWW merge of two versions of the same entity, with sticky deletion. */
function mergeFields(a: Json, b: Json, maps: readonly string[], card: boolean): Json {
  const out: Json = {};
  const clocks: Record<string, string> = {};
  const grouped = new Set<string>(card ? SCHEDULING_FIELDS : []);
  if (card) {
    // The scheduling state travels with its own clocks so the choice stays associative.
    const side = pickCardGroup(a, b);
    for (const f of SCHEDULING_FIELDS) {
      if (side[f] !== undefined) out[f] = side[f];
      clocks[f] = fieldHlc(side, f);
    }
  }
  for (const f of maps) if (a[f] !== undefined || b[f] !== undefined) out[f] = {};
  const paths = new Set([...trackedPaths(a, maps), ...trackedPaths(b, maps)]);
  for (const p of paths) {
    if (grouped.has(p)) continue;
    const ca = pathHlc(a, p, maps);
    const cb = pathHlc(b, p, maps);
    const va = pathValue(a, p, maps);
    const vb = pathValue(b, p, maps);
    setPath(out, p, pickByClock(ca, va, cb, vb) === 'a' ? va : vb, maps);
    clocks[p] = maxEncoded(ca, cb);
  }

  out['id'] = a['id'] ?? b['id'];
  const createdAt = minDefined(a['createdAt'], b['createdAt']);
  if (createdAt !== undefined) out['createdAt'] = createdAt;
  const updatedAt = maxDefined(a['updatedAt'], b['updatedAt']);
  if (updatedAt !== undefined) out['updatedAt'] = updatedAt;
  const deletedAt = minDefined(a['deletedAt'], b['deletedAt']);
  if (deletedAt !== undefined) out['deletedAt'] = deletedAt;

  for (const f of [BASE_CLOCK, ...maps]) {
    clocks[f] = maxEncoded(pathHlc(a, f, maps), pathHlc(b, f, maps));
  }
  out['sync'] = compactMeta(maxEncoded(entityHlc(a), entityHlc(b)), clocks, maps);
  return out;
}

function settingClock(r: SettingRow): string {
  return r.hlc ?? hlcFromMillis(r.updatedAt);
}

/** Settings: last writer wins per key (whole row). */
export function mergeSetting(a: SettingRow, b: SettingRow): SettingRow {
  return pickByClock(settingClock(a), a, settingClock(b), b) === 'a' ? a : b;
}

/**
 * Merges a remote version into the local one (`local` undefined: the remote is new here).
 * - entities: field-level LWW on `sync.fields` clocks (note fields per name), sticky deletion;
 * - cards: scheduling fields come from the version with the latest `lastReview`;
 * - review logs: same identity merge (logs are immutable), a tombstone wins;
 * - settings: whole-row LWW on `hlc`.
 */
export function mergeEntity<K extends ChangeKind>(
  kind: K,
  local: ChangeData<K> | undefined,
  remote: ChangeData<K>,
): ChangeData<K> {
  if (local === undefined || deepEqual(local, remote)) return remote;
  if (kind === 'setting') {
    return mergeSetting(local as SettingRow, remote as SettingRow) as ChangeData<K>;
  }
  return mergeFields(local, remote, mapFieldsOf(kind), kind === 'card') as ChangeData<K>;
}

function withoutSync(e: object): Json {
  const rest: Json = { ...e };
  delete rest['sync'];
  delete rest['hlc'];
  return rest;
}

/** Merges a change into the stored state and tells whether local data overrode the remote one. */
export function mergeChange<K extends ChangeKind>(
  kind: K,
  local: ChangeData<K> | undefined,
  remote: ChangeData<K>,
): { merged: ChangeData<K>; conflict: boolean } {
  const merged = mergeEntity(kind, local, remote);
  const conflict =
    local !== undefined &&
    !deepEqual(withoutSync(local), withoutSync(remote)) &&
    !deepEqual(withoutSync(merged), withoutSync(remote));
  return { merged, conflict };
}

/** Identity of a change: its kind plus id (or key for settings). */
export function changeKey(change: Change): string {
  return change.kind === 'setting'
    ? `setting:${change.data.key}`
    : `${change.kind}:${change.data.id}`;
}
