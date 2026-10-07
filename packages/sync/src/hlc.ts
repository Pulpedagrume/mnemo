import type { Clock } from '@mnemo/core';

/** Hybrid logical clock timestamp (docs/SYNC.md). */
export interface Hlc {
  /** Milliseconds since the epoch (logical: never goes backwards). */
  wall: number;
  counter: number;
  node: string;
}

const WALL_DIGITS = 13;
const COUNTER_DIGITS = 4;
const MAX_COUNTER = 0xffff;
const MAX_WALL = 10 ** WALL_DIGITS - 1;

/** Smallest possible HLC: sorts before every real one. */
export const ZERO_HLC = encodeHlc({ wall: 0, counter: 0, node: '' });

/** Encodes as `WWWWWWWWWWWWW-CCCC-node`: lexicographic order equals HLC order. */
export function encodeHlc(h: Hlc): string {
  const wall = Math.min(MAX_WALL, Math.max(0, Math.floor(h.wall)));
  const counter = Math.min(MAX_COUNTER, Math.max(0, Math.floor(h.counter)));
  return `${String(wall).padStart(WALL_DIGITS, '0')}-${counter
    .toString(16)
    .padStart(COUNTER_DIGITS, '0')}-${h.node}`;
}

const HLC_RE = /^(\d{13})-([0-9a-f]{4})-(.*)$/s;

/** Decodes an encoded HLC; throws on malformed input. */
export function decodeHlc(s: string): Hlc {
  const m = HLC_RE.exec(s);
  if (!m) throw new Error(`Invalid HLC: ${s}`);
  return { wall: Number(m[1]), counter: parseInt(m[2] ?? '0', 16), node: m[3] ?? '' };
}

export function isHlc(s: string): boolean {
  return HLC_RE.test(s);
}

/** Total order: wall, then counter, then node. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.node === b.node) return 0;
  return a.node < b.node ? -1 : 1;
}

/** Compares two encoded HLCs (string order equals HLC order thanks to fixed-width fields). */
export function compareEncoded(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function maxEncoded(a: string, b: string): string {
  return compareEncoded(a, b) >= 0 ? a : b;
}

/** Encodes a plain millisecond timestamp as the weakest HLC of that instant (node ''). */
export function hlcFromMillis(ms: number): string {
  return encodeHlc({ wall: ms, counter: 0, node: '' });
}

export interface HlcClock {
  /** Timestamp for a local event (send). Strictly greater than every previous one. */
  now(): string;
  /** Merges a remote timestamp so later local events sort after it. Returns the new clock value. */
  receive(remote: string): string;
  /** Last issued value, without advancing. */
  peek(): string;
}

/** Normalizes a (wall, counter) pair so the counter fits its 4 hex digits. */
function normalize(wall: number, counter: number): { wall: number; counter: number } {
  if (counter <= MAX_COUNTER) return { wall, counter };
  return { wall: wall + 1, counter: 0 };
}

/**
 * Creates a hybrid logical clock for `node`. Monotonic even when `clock` goes backwards:
 * the logical wall time never decreases and the counter breaks ties.
 */
export function createHlcClock(clock: Clock, node: string, initial?: string): HlcClock {
  let wall = 0;
  let counter = 0;
  if (initial !== undefined) {
    const h = decodeHlc(initial);
    wall = h.wall;
    counter = h.counter;
  }
  const current = (): string => encodeHlc({ wall, counter, node });

  return {
    now() {
      const pt = Math.floor(clock.now());
      const next = pt > wall ? { wall: pt, counter: 0 } : normalize(wall, counter + 1);
      wall = next.wall;
      counter = next.counter;
      return current();
    },
    receive(remote) {
      const r = decodeHlc(remote);
      const pt = Math.floor(clock.now());
      const w = Math.max(wall, r.wall, pt);
      let c: number;
      if (w === wall && w === r.wall) c = Math.max(counter, r.counter) + 1;
      else if (w === wall) c = counter + 1;
      else if (w === r.wall) c = r.counter + 1;
      else c = 0;
      const next = normalize(w, c);
      wall = next.wall;
      counter = next.counter;
      return current();
    },
    peek: current,
  };
}
