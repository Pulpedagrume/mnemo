/** Small text helpers shared by the parsers. Pure, no DOM or Node APIs. */

/** UTF-8 byte length without allocating an encoded copy. */
export function utf8Length(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** 1-based line and column of a UTF-16 offset. */
export function lineColAt(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: end - lastBreak };
}

/** Offsets of the start of every line (index 0 = line 1). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 1-based line of an offset, by binary search in `lineStarts`. */
export function lineOf(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Lowercase, accents removed, trimmed: for case/accent-insensitive name matching. */
export function foldName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/** Closest candidate within `maxDistance` (default: a third of the word, at least 2). */
export function closest(
  word: string,
  candidates: readonly string[],
  maxDistance?: number,
): string | undefined {
  const w = foldName(word);
  const limit = maxDistance ?? Math.max(2, Math.floor(w.length / 3));
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(w, foldName(c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= limit ? best : undefined;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
