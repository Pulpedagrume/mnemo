import { hlcFromMillis } from './hlc';
import type { Json } from './util';

/**
 * Clock "paths" of an entity: each top-level field is a path, except map fields (e.g. a note's
 * `fields`, keyed by field name) whose entries are tracked separately as `fields.<name>`, so two
 * devices editing different note fields both keep their edit.
 */

/**
 * Key of the base clock in `sync.fields`. Clock lookup of a path: `fields[path]`, else (map
 * entries) `fields[mapField]`, else `fields['*']`, else `hlc`. The base clock covers every path
 * the entity has not written since (e.g. an optional field another device added later): it must
 * not move when an unrelated field changes, or an absent field would beat a remote addition.
 */
export const BASE_CLOCK = '*';

export interface SyncMetaLike {
  hlc: string;
  fields?: Record<string, string>;
}

/** Fields whose clock is not tracked (merged by dedicated rules). */
export const UNTRACKED = new Set(['id', 'sync', 'updatedAt', 'createdAt', 'deletedAt']);

/** Map fields per change kind. */
export const MAP_FIELDS: Readonly<Record<string, readonly string[]>> = { note: ['fields'] };

export function mapFieldsOf(kind: string): readonly string[] {
  return MAP_FIELDS[kind] ?? [];
}

function meta(e: Json): SyncMetaLike | undefined {
  return e['sync'] as SyncMetaLike | undefined;
}

/** HLC of the entity's last write: `sync.hlc`, else its `updatedAt` (or `ts`/`createdAt`). */
export function entityHlc(e: Json): string {
  const m = meta(e);
  if (m) return m.hlc;
  const t = e['updatedAt'] ?? e['ts'] ?? e['createdAt'];
  return hlcFromMillis(typeof t === 'number' ? t : 0);
}

/** Splits `fields.front` into its map field and key when `fields` is a map field. */
function splitPath(path: string, maps: readonly string[]): [string, string] | undefined {
  for (const f of maps) if (path.startsWith(`${f}.`)) return [f, path.slice(f.length + 1)];
  return undefined;
}

/** Base clock: `fields['*']`, else the entity clock. */
export function baseHlc(e: Json): string {
  return meta(e)?.fields?.[BASE_CLOCK] ?? entityHlc(e);
}

/** Clock of a path (see lookup order above). A bare map field name gives the map's clock. */
export function pathHlc(e: Json, path: string, maps: readonly string[] = []): string {
  if (path === BASE_CLOCK) return baseHlc(e);
  const fields = meta(e)?.fields;
  const own = fields?.[path];
  if (own !== undefined) return own;
  const split = splitPath(path, maps);
  const parent = split ? fields?.[split[0]] : undefined;
  return parent ?? baseHlc(e);
}

/**
 * Sync metadata from the full clock of every path (plus the base clock and map clocks): entries
 * equal to what the lookup would find anyway are dropped.
 */
export function compactMeta(
  hlc: string,
  clocks: Readonly<Record<string, string>>,
  maps: readonly string[],
): SyncMetaLike {
  const base = clocks[BASE_CLOCK] ?? hlc;
  const fields: Record<string, string> = {};
  if (base !== hlc) fields[BASE_CLOCK] = base;
  for (const f of maps) {
    const c = clocks[f];
    if (c !== undefined && c !== base) fields[f] = c;
  }
  for (const [p, c] of Object.entries(clocks)) {
    if (p === BASE_CLOCK || maps.includes(p)) continue;
    const split = splitPath(p, maps);
    const fallback = split ? (fields[split[0]] ?? base) : base;
    if (c !== fallback) fields[p] = c;
  }
  return Object.keys(fields).length ? { hlc, fields } : { hlc };
}

export function pathValue(e: Json, path: string, maps: readonly string[] = []): unknown {
  const split = splitPath(path, maps);
  if (!split) return e[path];
  const m = e[split[0]];
  return m !== null && typeof m === 'object' ? (m as Json)[split[1]] : undefined;
}

/** Tracked paths of an entity: its fields (map entries expanded) and paths with a clock. */
export function trackedPaths(e: Json, maps: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (UNTRACKED.has(k)) continue;
    if (maps.includes(k) && v !== null && typeof v === 'object') {
      for (const sub of Object.keys(v)) out.push(`${k}.${sub}`);
    } else if (!maps.includes(k)) out.push(k);
  }
  for (const p of Object.keys(meta(e)?.fields ?? {})) {
    if (p !== BASE_CLOCK && !maps.includes(p)) out.push(p);
  }
  return out;
}

/** Writes `value` at `path` into `out` (creating the map object of a map field). */
export function setPath(out: Json, path: string, value: unknown, maps: readonly string[]): void {
  if (value === undefined) return;
  const split = splitPath(path, maps);
  if (!split) {
    out[path] = value;
    return;
  }
  const m = (out[split[0]] ?? {}) as Json;
  m[split[1]] = value;
  out[split[0]] = m;
}
