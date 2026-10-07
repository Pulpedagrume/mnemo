/** Small structural helpers shared by merge and stamping (JSON-like values only). */

export type Json = Record<string, unknown>;

/** JSON with sorted object keys; `undefined` becomes '' so it sorts before every value. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value instanceof Uint8Array) return Array.from(value);
  if (value !== null && typeof value === 'object') {
    const out: Json = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Json)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** Structural equality; `undefined` properties are ignored, as in JSON. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return stableStringify(a) === stableStringify(b);
}

/** Approximate UTF-8 size of a value once serialized as JSON. */
export function jsonBytes(value: unknown): number {
  const s = JSON.stringify(value);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
