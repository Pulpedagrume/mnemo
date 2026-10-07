import { getField, isBuiltinNoteTypeId } from '@mnemo/core';
import type { Note, NoteData, NoteType, Source } from '@mnemo/core';
import type { ImportNote } from '../format/schema';

export interface NoteToImportOptions {
  /** Full deck path of the note ("A::B"). */
  deckPath: string;
  /** Default deck of the target document: `deck` is omitted when equal. */
  defaultDeck?: string;
}

type Entries = Record<string, unknown>;

const nonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

/** Error thrown when a note cannot be expressed in the import format (e.g. missing `data`). */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

function dataOf<K extends NoteData['kind']>(note: Note, kind: K): Extract<NoteData, { kind: K }> {
  const data = note.data;
  if (data?.kind !== kind)
    throw new ExportError(`Note ${note.uid ?? note.id} (${kind}) has no "${kind}" data`);
  return data as Extract<NoteData, { kind: K }>;
}

/** Source as an object without empty keys, or undefined when nothing is left. */
export function cleanSource(source: Source | undefined): Source | undefined {
  if (!source) return undefined;
  const out: Source = {};
  if (nonBlank(source.doc)) out.doc = source.doc;
  if (source.page !== undefined && String(source.page).trim() !== '') out.page = source.page;
  if (nonBlank(source.section)) out.section = source.section;
  if (nonBlank(source.url)) out.url = source.url;
  return Object.keys(out).length > 0 ? out : undefined;
}

function typeSpecific(note: Note, typeId: string): Entries {
  const f = (name: string) => getField(note.fields, name);
  switch (typeId) {
    case 'basic':
    case 'basic_reversed':
      return { front: f('front'), back: f('back') };
    case 'typed': {
      const d = dataOf(note, 'typed');
      const out: Entries = {
        front: f('front'),
        answer: d.answers.length === 1 ? d.answers[0] : [...d.answers],
      };
      if (d.caseSensitive) out.caseSensitive = true;
      if (!d.ignoreAccents) out.ignoreAccents = false;
      return out;
    }
    case 'cloze':
      return { text: f('text') };
    case 'mcq': {
      const d = dataOf(note, 'mcq');
      const out: Entries = {
        question: f('question'),
        choices: d.choices.map((c) =>
          nonBlank(c.explanation)
            ? { text: c.text, correct: c.correct, explanation: c.explanation }
            : { text: c.text, correct: c.correct },
        ),
      };
      if (!d.shuffle) out.shuffle = false;
      return out;
    }
    case 'truefalse':
      return { statement: f('statement'), answer: dataOf(note, 'truefalse').answer };
    case 'matching': {
      const d = dataOf(note, 'matching');
      const out: Entries = {};
      if (nonBlank(f('question'))) out.question = f('question');
      out.pairs = d.pairs.map((p) => ({ left: p.left, right: p.right }));
      if (d.distractors.length > 0) out.distractors = [...d.distractors];
      return out;
    }
    case 'ordering':
      return { question: f('question'), steps: [...dataOf(note, 'ordering').steps] };
    case 'list': {
      const d = dataOf(note, 'list');
      const out: Entries = { question: f('question'), items: [...d.items] };
      if (d.ordered) out.ordered = true;
      return out;
    }
    default:
      throw new ExportError(`Unknown built-in note type "${typeId}"`);
  }
}

/** Fields of a custom/template note, keyed by the declared field names, in declaration order. */
function customFields(note: Note, noteType: NoteType): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of noteType.fields) out[field.name] = getField(note.fields, field.name);
  return out;
}

/** True when the note type is exported as `custom:<id>` (anything but a built-in id). */
export function isCustomNoteType(noteType: NoteType): boolean {
  return !isBuiltinNoteTypeId(noteType.id);
}

/**
 * Domain note → canonical `mnemo/1` note: the inverse of the import normalization.
 * Optional keys are omitted when absent or equal to their default. Keys are inserted in the
 * stable export order (type, uid, type-specific keys, common keys).
 */
export function noteToImportNote(
  note: Note,
  noteType: NoteType,
  opts: NoteToImportOptions,
): ImportNote {
  const custom = isCustomNoteType(noteType);
  const out: Entries = { type: custom ? `custom:${noteType.id}` : noteType.id };
  if (note.uid !== undefined) out.uid = note.uid;
  Object.assign(
    out,
    custom ? { fields: customFields(note, noteType) } : typeSpecific(note, noteType.id),
  );
  if (nonBlank(opts.deckPath) && opts.deckPath !== opts.defaultDeck) out.deck = opts.deckPath;
  if (note.tags.length > 0) out.tags = [...note.tags];
  const hints = note.hints.filter(nonBlank);
  if (hints.length === 1) out.hint = hints[0];
  else if (hints.length > 1) out.hint = hints;
  if (nonBlank(note.explanation)) out.explanation = note.explanation;
  const extra = getField(note.fields, 'extra');
  if (!custom && nonBlank(extra)) out.extra = extra;
  const source = cleanSource(note.source);
  if (source) out.source = source;
  if (note.difficulty !== undefined) out.difficulty = note.difficulty;
  if (note.needsReview !== undefined) out.needsReview = note.needsReview;
  // The object is built key by key to control the order; tests validate it against the schema.
  return out as ImportNote;
}
