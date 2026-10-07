import {
  FIELD,
  builtinNoteType,
  fieldKey,
  generateCardOrds,
  NoteDataSchema,
  type NoteData,
  type Source,
} from '@mnemo/core';
import type { ParsedNote } from '../api';
import type { ImportNote } from '../format/schema';
import type { NoteCtx } from './context';
import { isCustomNote, type BuiltinImportNote } from './validate';
import { t } from './issue';

export interface NormalizeEnv {
  defaultDeck: string;
  defaultTags: readonly string[];
  /** Custom note type id (without `custom:`) → number of card templates. */
  customTemplates: ReadonlyMap<string, number>;
}

const MAX_TAG_LENGTH = 100;

/** "A :: B::" → "A::B". */
export function normalizeDeck(path: string): string {
  return path
    .split('::')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('::');
}

/** Splits tags on spaces and commas; keeps order, removes duplicates and empty tags. */
export function splitTags(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  const list = typeof value === 'string' ? [value] : value;
  const out: string[] = [];
  for (const item of list) {
    for (const tag of item.split(/[\s,]+/)) if (tag !== '' && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function toSource(src: ImportNote['source']): Source | undefined {
  if (src === undefined) return undefined;
  const s = typeof src === 'string' ? { doc: src } : src;
  const out: Source = {};
  if (s.doc !== undefined) out.doc = s.doc.slice(0, 500);
  if (s.page !== undefined) out.page = typeof s.page === 'string' ? s.page.slice(0, 50) : s.page;
  if (s.section !== undefined) out.section = s.section.slice(0, 500);
  if (s.url !== undefined) out.url = s.url.slice(0, 2000);
  return out;
}

function fieldsAndData(note: ImportNote): { fields: Record<string, string>; data?: NoteData } {
  if (isCustomNote(note)) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(note.fields)) fields[fieldKey(k)] = v;
    return { fields };
  }
  return builtinFieldsAndData(note);
}

function builtinFieldsAndData(note: BuiltinImportNote): {
  fields: Record<string, string>;
  data?: NoteData;
} {
  switch (note.type) {
    case 'basic':
    case 'basic_reversed':
      return { fields: { [FIELD.front]: note.front, [FIELD.back]: note.back } };
    case 'typed':
      return {
        fields: { [FIELD.front]: note.front },
        data: {
          kind: 'typed',
          answers: Array.isArray(note.answer) ? note.answer : [note.answer],
          caseSensitive: note.caseSensitive ?? false,
          ignoreAccents: note.ignoreAccents ?? true,
        },
      };
    case 'cloze':
      return {
        fields:
          note.extra === undefined
            ? { [FIELD.text]: note.text }
            : { [FIELD.text]: note.text, [FIELD.extra]: note.extra },
      };
    case 'mcq':
      return {
        fields: { [FIELD.question]: note.question },
        data: {
          kind: 'mcq',
          choices: note.choices.map((c) =>
            typeof c === 'string'
              ? { text: c, correct: false }
              : c.explanation === undefined
                ? { text: c.text, correct: c.correct === true }
                : { text: c.text, correct: c.correct === true, explanation: c.explanation },
          ),
          shuffle: note.shuffle ?? true,
        },
      };
    case 'truefalse':
      return {
        fields: { [FIELD.statement]: note.statement },
        data: { kind: 'truefalse', answer: note.answer },
      };
    case 'matching':
      return {
        fields: note.question === undefined ? {} : { [FIELD.question]: note.question },
        data: { kind: 'matching', pairs: note.pairs, distractors: note.distractors ?? [] },
      };
    case 'ordering':
      return {
        fields: { [FIELD.question]: note.question },
        data: { kind: 'ordering', steps: note.steps },
      };
    case 'list':
      return {
        fields: { [FIELD.question]: note.question },
        data: { kind: 'list', items: note.items, ordered: note.ordered ?? false },
      };
  }
}

/** Converts a valid import note to the domain shape; undefined if it generates no card. */
export function toParsedNote(
  note: ImportNote,
  ctx: NoteCtx,
  env: NormalizeEnv,
  media: readonly string[],
): ParsedNote | undefined {
  const { fields, data } = fieldsAndData(note);
  if (data !== undefined && !NoteDataSchema.safeParse(data).success) {
    ctx.sink.error(
      'invalid_value',
      t('Contenu structuré de la note invalide.', 'Invalid structured note content.'),
      t(
        'Vérifiez les listes de la note (propositions, paires, étapes, éléments).',
        'Check the note lists (choices, pairs, steps, items).',
      ),
      ctx.loc(),
    );
    return undefined;
  }
  let explanation = note.explanation;
  if (note.type !== 'cloze' && note.extra !== undefined) {
    explanation = explanation === undefined ? note.extra : `${explanation}\n\n${note.extra}`;
  }
  const tags: string[] = [];
  for (const tag of splitTags([...env.defaultTags, ...splitTags(note.tags)])) {
    if (tag.length <= MAX_TAG_LENGTH) tags.push(tag);
    else {
      ctx.sink.warn(
        'invalid_value',
        t(
          `Étiquette ignorée (plus de ${MAX_TAG_LENGTH} caractères).`,
          `Tag ignored (over ${MAX_TAG_LENGTH} characters).`,
        ),
        t('Utilisez des étiquettes courtes, sans espaces.', 'Use short tags without spaces.'),
        ctx.loc(['tags'], { excerpt: tag }),
      );
    }
  }
  const type = builtinNoteType(note.type);
  const customId = note.type.replace(/^custom:/, '');
  const cards = type
    ? generateCardOrds(data === undefined ? { fields } : { fields, data }, type).length
    : (env.customTemplates.get(customId) ?? 1);
  const parsed: ParsedNote = {
    index: ctx.index,
    noteTypeId: note.type,
    deck: normalizeDeck(note.deck ?? env.defaultDeck),
    fields,
    tags,
    hints: note.hint === undefined ? [] : Array.isArray(note.hint) ? note.hint : [note.hint],
    media: [...media],
    cards,
  };
  if (ctx.line !== undefined) parsed.line = ctx.line;
  if (note.uid !== undefined) parsed.uid = note.uid;
  if (data !== undefined) parsed.data = data;
  if (explanation !== undefined) parsed.explanation = explanation;
  const source = toSource(note.source);
  if (source !== undefined) parsed.source = source;
  if (note.difficulty !== undefined) parsed.difficulty = note.difficulty;
  if (note.needsReview !== undefined) parsed.needsReview = note.needsReview;
  return parsed;
}
