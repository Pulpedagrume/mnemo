import type { ImportNote } from '../format/schema';

/**
 * Readers that flatten the tolerant unions of the canonical format (string or list, compact MCQ
 * choices…) so the Markdown and CSV writers handle documents that did not come from
 * `buildImportDocument`.
 */

export type CustomImportNote = Extract<ImportNote, { fields: Record<string, string> }>;
export type BuiltinImportNote = Exclude<ImportNote, CustomImportNote>;

export const isCustomImportNote = (note: ImportNote): note is CustomImportNote =>
  note.type.startsWith('custom:');

export interface ChoiceOut {
  text: string;
  correct: boolean;
  explanation?: string;
}

export const asList = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : [...value];

/** Tags as a list (a string is split on spaces and commas). */
export function tagsOf(tags: string | readonly string[] | undefined): string[] {
  if (tags === undefined) return [];
  if (typeof tags === 'string') return tags.split(/[\s,]+/).filter((t) => t !== '');
  return tags.map((t) => t.trim()).filter((t) => t !== '');
}

/** Index (0-based) designated by a compact answer: letter "A".."H" or 1-based number. */
function answerIndex(ref: string | number): number {
  if (typeof ref === 'number') return ref - 1;
  const s = ref.trim();
  if (/^\d+$/.test(s)) return Number(s) - 1;
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
  return -1;
}

/** MCQ choices as objects, applying the compact `answers` form when present. */
export function choicesOf(note: Extract<ImportNote, { type: 'mcq' }>): ChoiceOut[] {
  const fromAnswers = new Set((note.answers ?? []).map(answerIndex));
  return note.choices.map((c, i) => {
    if (typeof c === 'string') return { text: c, correct: fromAnswers.has(i) };
    const out: ChoiceOut = { text: c.text, correct: c.correct ?? fromAnswers.has(i) };
    if (c.explanation !== undefined) out.explanation = c.explanation;
    return out;
  });
}

/** Source as display text: plain when only `doc` is set, else a JSON object. */
export function sourceText(source: ImportNote['source']): string | undefined {
  if (source === undefined) return undefined;
  if (typeof source === 'string') return source;
  const keys = Object.keys(source).filter((k) => source[k as keyof typeof source] !== undefined);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && source.doc !== undefined && !source.doc.includes('\n')) {
    // A doc starting with "{" would be read back as JSON: keep the JSON form then.
    if (!source.doc.trimStart().startsWith('{')) return source.doc;
  }
  const ordered: Record<string, unknown> = {};
  for (const k of ['doc', 'page', 'section', 'url'] as const)
    if (source[k] !== undefined) ordered[k] = source[k];
  return JSON.stringify(ordered);
}

/** Label used in warnings: the uid, or the 1-based position. */
export const noteLabel = (note: ImportNote, index: number): string => note.uid ?? `#${index + 1}`;

/** Explanation with the per-choice explanations appended (they have no slot of their own). */
export function explanationWithChoices(
  explanation: string | undefined,
  choices: readonly ChoiceOut[],
): string | undefined {
  const lines = choices
    .filter((c) => c.explanation !== undefined && c.explanation.trim() !== '')
    .map((c) => `- ${c.text}: ${c.explanation ?? ''}`);
  if (lines.length === 0) return explanation;
  return [explanation, lines.join('\n')].filter((s) => s !== undefined && s !== '').join('\n\n');
}
