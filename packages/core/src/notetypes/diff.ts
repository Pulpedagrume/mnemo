/** Text normalization and character diff used to grade typed answers. */

export interface AnswerNormalization {
  caseSensitive: boolean;
  ignoreAccents: boolean;
}

/** Maximum number of characters (code points) of a typed answer that are compared. */
export const MAX_TYPED_LENGTH = 500;

/** NFC, trimmed, whitespace runs collapsed to one space, capped at MAX_TYPED_LENGTH code points. */
export function tidyAnswer(text: string): string {
  const tidy = text.normalize('NFC').trim().replace(/\s+/g, ' ');
  const chars = Array.from(tidy);
  return chars.length > MAX_TYPED_LENGTH ? chars.slice(0, MAX_TYPED_LENGTH).join('') : tidy;
}

/** Folds case and/or accents according to the options. */
export function foldText(text: string, opts: AnswerNormalization): string {
  let s = opts.caseSensitive ? text : text.toLowerCase();
  if (opts.ignoreAccents) s = s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  return s;
}

/** Comparison form of an answer: tidied, then folded. */
export function normalizeAnswer(text: string, opts: AnswerNormalization): string {
  return foldText(tidyAnswer(text), opts);
}

export interface DiffSegment {
  /** equal: typed correctly; missing: expected but not typed; extra: typed but not expected. */
  type: 'equal' | 'missing' | 'extra';
  text: string;
}

/** LCS table of suffixes: table[i * (m + 1) + j] = LCS length of a[i..] and b[j..]. */
function lcsTable(a: readonly string[], b: readonly string[]): Uint16Array {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] =
        a[i] === b[j]
          ? (table[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * w + j] ?? 0, table[i * w + j + 1] ?? 0);
    }
  }
  return table;
}

/**
 * Character diff of `input` against `expected` (O(n·m), inputs are capped by the caller).
 * Characters are compared after folding with `opts`; `equal` segments show the expected text.
 */
export function diffChars(
  input: string,
  expected: string,
  opts: AnswerNormalization,
): { segments: DiffSegment[]; lcs: number } {
  const rawA = Array.from(input);
  const rawB = Array.from(expected);
  const a = rawA.map((c) => foldText(c, opts));
  const b = rawB.map((c) => foldText(c, opts));
  const table = lcsTable(a, b);
  const w = b.length + 1;
  const segments: DiffSegment[] = [];
  const push = (type: DiffSegment['type'], ch: string): void => {
    const last = segments[segments.length - 1];
    if (last?.type === type) last.text += ch;
    else segments.push({ type, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('equal', rawB[j] ?? '');
      i++;
      j++;
    } else if (
      j >= b.length ||
      (i < a.length && (table[(i + 1) * w + j] ?? 0) >= (table[i * w + j + 1] ?? 0))
    ) {
      push('extra', rawA[i] ?? '');
      i++;
    } else {
      push('missing', rawB[j] ?? '');
      j++;
    }
  }
  return { segments, lcs: table[0] ?? 0 };
}
