/** Deterministic random source returning floats in [0, 1). Always injected. */
export interface Rng {
  next(): number;
}

/**
 * Seeded PRNG (mulberry32). Same seed, same sequence, on every platform.
 * Not cryptographically secure: only for scheduling fuzz, shuffling and simulations.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Integer in [min, max] inclusive. */
export function randomInt(rng: Rng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`randomInt: invalid range [${min}, ${max}]`);
  }
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Returns a shuffled copy (Fisher–Yates); the input is not modified. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
