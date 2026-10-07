import type { Clock } from './clock';
import type { Rng } from './rng';

export type IdGenerator = () => string;

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * UUIDv7 (RFC 9562): 48-bit Unix ms timestamp, then random bits. Sortable by creation time.
 * Clock and randomness are injected so ids are reproducible in tests.
 */
export function uuidv7(now: number, rng: Rng): string {
  const bytes = new Array<number>(16);
  let ts = Math.max(0, Math.floor(now));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  for (let i = 6; i < 16; i++) bytes[i] = Math.floor(rng.next() * 256);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC variant
  const h = bytes.map((b) => HEX[b] ?? '00');
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}

export function createIdGenerator(clock: Clock, rng: Rng): IdGenerator {
  return () => uuidv7(clock.now(), rng);
}

/** Milliseconds timestamp embedded in a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
