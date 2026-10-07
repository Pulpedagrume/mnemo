import type { I18nString } from '../i18n';
import type { CardTemplate, NoteType, Renderer } from '../model/noteType';
import type { NoteTypeLike, NoteTypeSpec } from './types';

/** Keys of the built-in fields in `Note.fields` (always lowercase). */
export const FIELD = {
  front: 'front',
  back: 'back',
  text: 'text',
  extra: 'extra',
  question: 'question',
  statement: 'statement',
} as const;
export type BuiltinFieldKey = (typeof FIELD)[keyof typeof FIELD];

/**
 * Key under which a field is stored in `Note.fields`: its name in lowercase ("Front" -> "front").
 * Lookups are case-insensitive anyway (see `getField`), but writers should use this key.
 */
export function fieldKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Case-insensitive field lookup; missing fields read as ''. */
export function getField(fields: Readonly<Record<string, string>>, name: string): string {
  const direct = fields[name];
  if (direct !== undefined) return direct;
  const key = fieldKey(name);
  const lower = fields[key];
  if (lower !== undefined) return lower;
  for (const [k, v] of Object.entries(fields)) if (fieldKey(k) === key) return v;
  return '';
}

/** Built-in note type ids: stable, equal to the import `type` names. */
export const BUILTIN_NOTE_TYPE_IDS = [
  'basic',
  'basic_reversed',
  'typed',
  'cloze',
  'mcq',
  'truefalse',
  'matching',
  'ordering',
  'list',
] as const;
export type BuiltinNoteTypeId = (typeof BUILTIN_NOTE_TYPE_IDS)[number];

export function isBuiltinNoteTypeId(id: string): id is BuiltinNoteTypeId {
  return (BUILTIN_NOTE_TYPE_IDS as readonly string[]).includes(id);
}

/** Display names of the built-in note types (the stored `name` is the French one). */
export const BUILTIN_NOTE_TYPE_LABELS: Readonly<Record<BuiltinNoteTypeId, I18nString>> = {
  basic: { fr: 'Basique', en: 'Basic' },
  basic_reversed: { fr: 'Basique et inversée', en: 'Basic and reversed' },
  typed: { fr: 'Réponse à saisir', en: 'Typed answer' },
  cloze: { fr: 'Texte à trous', en: 'Cloze' },
  mcq: { fr: 'QCM', en: 'Multiple choice' },
  truefalse: { fr: 'Vrai / faux', en: 'True / false' },
  matching: { fr: 'Association', en: 'Matching' },
  ordering: { fr: 'Remise en ordre', en: 'Ordering' },
  list: { fr: 'Liste', en: 'List' },
};

const FRONT_TO_BACK: CardTemplate = {
  name: 'Front → Back',
  front: '{{Front}}',
  back: '{{FrontSide}}\n\n---\n\n{{Back}}',
};
const BACK_TO_FRONT: CardTemplate = {
  name: 'Back → Front',
  front: '{{Back}}',
  back: '{{FrontSide}}\n\n---\n\n{{Front}}',
};

interface BuiltinShape {
  renderer: Renderer;
  fields: readonly (readonly [name: string, required: boolean])[];
  templates: readonly CardTemplate[];
}

const SHAPES: Readonly<Record<BuiltinNoteTypeId, BuiltinShape>> = {
  basic: {
    renderer: 'basic',
    fields: [
      ['Front', true],
      ['Back', true],
    ],
    templates: [FRONT_TO_BACK],
  },
  basic_reversed: {
    renderer: 'basic',
    fields: [
      ['Front', true],
      ['Back', true],
    ],
    templates: [FRONT_TO_BACK, BACK_TO_FRONT],
  },
  typed: { renderer: 'typed', fields: [['Front', true]], templates: [] },
  cloze: {
    renderer: 'cloze',
    fields: [
      ['Text', true],
      ['Extra', false],
    ],
    templates: [],
  },
  mcq: { renderer: 'mcq', fields: [['Question', true]], templates: [] },
  truefalse: { renderer: 'truefalse', fields: [['Statement', true]], templates: [] },
  matching: { renderer: 'matching', fields: [['Question', false]], templates: [] },
  ordering: { renderer: 'ordering', fields: [['Question', true]], templates: [] },
  list: { renderer: 'list', fields: [['Question', true]], templates: [] },
};

/** Built-in note type definition (without timestamps), or undefined for other ids. */
export function builtinNoteType(id: string): NoteTypeSpec | undefined {
  if (!isBuiltinNoteTypeId(id)) return undefined;
  const shape = SHAPES[id];
  return {
    id,
    name: BUILTIN_NOTE_TYPE_LABELS[id].fr,
    builtin: true,
    renderer: shape.renderer,
    fields: shape.fields.map(([name, required]) => ({ name, required })),
    templates: shape.templates.map((t) => ({ ...t })),
  };
}

/** All built-in note types, without timestamps. */
export const BUILTIN_NOTE_TYPES: readonly NoteTypeSpec[] = BUILTIN_NOTE_TYPE_IDS.map(
  (id) => builtinNoteType(id) as NoteTypeSpec,
);

/** Built-in note types as storable records (seed of a new collection). */
export function builtinNoteTypeRecords(now: number): NoteType[] {
  return BUILTIN_NOTE_TYPE_IDS.map((id) => ({
    ...(builtinNoteType(id) as NoteTypeSpec),
    createdAt: now,
    updatedAt: now,
  }));
}

const PRIMARY_FIELD: Readonly<Record<Exclude<Renderer, 'basic' | 'template'>, BuiltinFieldKey>> = {
  typed: FIELD.front,
  cloze: FIELD.text,
  mcq: FIELD.question,
  truefalse: FIELD.statement,
  matching: FIELD.question,
  ordering: FIELD.question,
  list: FIELD.question,
};

/**
 * Key of the main field of a note type: front/text/question/statement, or the first declared field
 * for template-based renderers (`basic`, `template`).
 */
export function primaryFieldKey(noteType: NoteTypeLike): string {
  if (noteType.renderer === 'basic' || noteType.renderer === 'template')
    return fieldKey(noteType.fields[0]?.name ?? '');
  return PRIMARY_FIELD[noteType.renderer];
}
