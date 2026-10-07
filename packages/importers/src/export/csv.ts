import type { ImportDocument } from '../format/schema';
import type { BuiltinImportNote } from './shape';
import {
  asList,
  choicesOf,
  isCustomImportNote,
  explanationWithChoices,
  noteLabel,
  sourceText,
  tagsOf,
} from './shape';

export const CSV_MAX_CHOICES = 8;

export const CSV_HEADERS: readonly string[] = [
  'type',
  'deck',
  'tags',
  'uid',
  'front',
  'back',
  'text',
  'extra',
  'hint',
  'explanation',
  'source',
  'question',
  ...Array.from({ length: CSV_MAX_CHOICES }, (_, i) => `choice${i + 1}`),
  'correct',
];

/** Note types that fit in the CSV columns. */
export const CSV_TYPES: readonly string[] = ['basic', 'basic_reversed', 'cloze', 'mcq'];

/** Separator of several hints in the `hint` column and of correct choices in `correct`. */
export const CSV_HINT_SEPARATOR = ' | ';

/** RFC 4180 cell: quoted (with doubled quotes) when it holds a comma, quote, line break or edge space. */
export function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

type Lost = 'hints' | 'choiceExplanations' | 'shuffle' | 'difficulty' | 'needsReview' | 'media';

const LOST_MESSAGES: Readonly<Record<Lost, string>> = {
  hints: `several hints joined with "${CSV_HINT_SEPARATOR}"`,
  choiceExplanations: 'per-choice explanations appended to explanation',
  shuffle: 'shuffle=false not representable, dropped',
  difficulty: 'difficulty not representable, dropped',
  needsReview: 'needsReview not representable, dropped',
  media: 'media references not representable, dropped',
};

function row(
  note: BuiltinImportNote,
  defaultDeck: string | undefined,
  lost: (k: Lost) => void,
): Record<string, string> {
  const r: Record<string, string> = { type: note.type };
  r.deck = note.deck ?? defaultDeck ?? '';
  r.tags = tagsOf(note.tags).join(' ');
  r.uid = note.uid ?? '';
  const hints = asList(note.hint);
  if (hints.length > 1) lost('hints');
  r.hint = hints.join(CSV_HINT_SEPARATOR);
  let explanation = note.explanation;
  r.extra = note.extra ?? '';
  r.source = sourceText(note.source) ?? '';
  if (note.difficulty !== undefined) lost('difficulty');
  if (note.needsReview !== undefined) lost('needsReview');
  if (note.media && note.media.length > 0) lost('media');
  if (note.type === 'basic' || note.type === 'basic_reversed') {
    r.front = note.front;
    r.back = note.back;
  } else if (note.type === 'cloze') {
    r.text = note.text;
  } else if (note.type === 'mcq') {
    const choices = choicesOf(note);
    r.question = note.question;
    choices.forEach((c, i) => (r[`choice${i + 1}`] = c.text));
    r.correct = choices
      .flatMap((c, i) => (c.correct ? [String(i + 1)] : []))
      .join(CSV_HINT_SEPARATOR.trim());
    if (choices.some((c) => c.explanation !== undefined)) {
      lost('choiceExplanations');
      explanation = explanationWithChoices(explanation, choices);
    }
    if (note.shuffle === false) lost('shuffle');
  }
  r.explanation = explanation ?? '';
  return r;
}

/**
 * Canonical document → CSV with the fixed `CSV_HEADERS` columns. Only basic, basic_reversed,
 * cloze and mcq are representable; other notes are skipped with a warning listing them.
 */
export function exportCsv(doc: ImportDocument): { text: string; warnings: string[] } {
  const skipped: string[] = [];
  const lostBy = new Map<Lost, string[]>();
  const lines = [CSV_HEADERS.join(',')];
  doc.notes.forEach((note, index) => {
    const label = noteLabel(note, index);
    if (isCustomImportNote(note) || !CSV_TYPES.includes(note.type)) {
      skipped.push(`${label} (${note.type})`);
      return;
    }
    const r = row(note, doc.defaults?.deck, (k) => {
      const list = lostBy.get(k) ?? [];
      if (list.at(-1) !== label) list.push(label);
      lostBy.set(k, list);
    });
    lines.push(CSV_HEADERS.map((h) => csvCell(r[h] ?? '')).join(','));
  });
  const warnings: string[] = [];
  if (skipped.length > 0)
    warnings.push(`Notes not representable in CSV, skipped: ${skipped.join(', ')}`);
  for (const [k, labels] of lostBy) warnings.push(`${LOST_MESSAGES[k]}: ${labels.join(', ')}`);
  if (tagsWithSpaces(doc)) warnings.push('Some tags contain spaces: they will be split on import');
  return { text: `${lines.join('\n')}\n`, warnings };
}

function tagsWithSpaces(doc: ImportDocument): boolean {
  return doc.notes.some((n) => Array.isArray(n.tags) && n.tags.some((t) => /\s/.test(t.trim())));
}
