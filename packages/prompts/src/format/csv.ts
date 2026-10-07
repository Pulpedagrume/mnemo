import type { ExampleDocument, ExampleNote } from './example-doc';
import { choicesOf, mergedExplanation, str, strings } from './example-doc';

/** Column order of the CSV format (same as the importer's CSV export). */
const CSV_COLUMNS: readonly string[] = [
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
  ...Array.from({ length: 8 }, (_, i) => `choice${String(i + 1)}`),
  'correct',
];

/** RFC 4180 cell: quoted (quotes doubled) when it holds a comma, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(note: ExampleNote, deck: string | undefined): Record<string, string> {
  const r: Record<string, string> = { type: String(note.type) };
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') r[key] = value;
  };
  set('deck', str(note.deck) ?? deck);
  set('tags', strings(note.tags).join(' '));
  set('uid', str(note.uid));
  set('front', str(note.front));
  set('back', str(note.back));
  set('text', str(note.text));
  set('extra', str(note.extra));
  set('hint', strings(note.hint).join(' | '));
  set('explanation', note.type === 'mcq' ? mergedExplanation(note) : str(note.explanation));
  set('source', str(note.source));
  if (note.type === 'mcq') {
    const choices = choicesOf(note);
    set('question', str(note.question));
    choices.forEach((c, i) => {
      set(`choice${String(i + 1)}`, c.text);
    });
    set(
      'correct',
      choices.flatMap((c, i) => (c.correct ? [String(i + 1)] : [])).join('|'),
    );
  }
  return r;
}

/** CSV with only the columns the example uses, in canonical order. */
export function toCsv(doc: ExampleDocument): string {
  const rows = doc.notes.map((n) => row(n, doc.defaults?.deck));
  const columns = CSV_COLUMNS.filter((c) => rows.some((r) => r[c] !== undefined));
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? '')).join(',')),
  ].join('\n');
}
