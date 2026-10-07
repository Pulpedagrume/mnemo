import type { FORMAT_ID } from '@mnemo/core';

/** One note of an example, with canonical keys (as in NOTE_TYPE_DOCS examples). */
export type ExampleNote = Record<string, unknown>;

export interface ExampleMedia {
  id: string;
  file: string;
  alt: string;
}

/** Canonical example document (a valid `mnemo/1` ImportDocument). */
export interface ExampleDocument {
  format: typeof FORMAT_ID;
  defaults?: { deck: string };
  media?: ExampleMedia[];
  notes: ExampleNote[];
}

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export interface ExampleChoice {
  text: string;
  correct: boolean;
  explanation?: string;
}

export function choicesOf(note: ExampleNote): ExampleChoice[] {
  const raw = Array.isArray(note.choices) ? (note.choices as unknown[]) : [];
  return raw.map((c) => {
    if (typeof c === 'string') return { text: c, correct: false };
    const o = (c ?? {}) as Record<string, unknown>;
    const explanation = str(o.explanation);
    return {
      text: str(o.text) ?? '',
      correct: o.correct === true,
      ...(explanation === undefined ? {} : { explanation }),
    };
  });
}

/** Note explanation followed by the per-choice explanations (formats without them). */
export function mergedExplanation(note: ExampleNote): string | undefined {
  const parts = [str(note.explanation), ...choicesOf(note).map((c) => c.explanation)].filter(
    (p): p is string => p !== undefined && p !== '',
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function pairsOf(note: ExampleNote): { left: string; right: string }[] {
  const raw = Array.isArray(note.pairs) ? (note.pairs as unknown[]) : [];
  return raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { left: str(o.left) ?? '', right: str(o.right) ?? '' };
  });
}
