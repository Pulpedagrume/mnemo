import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { parse as parseYaml } from 'yaml';
import { COMMON_FIELD_DOCS, NOTE_TYPE_DOCS } from '../format/specs';
import {
  BUILTIN_NOTE_SCHEMAS,
  IMPORT_NOTE_TYPES,
  ImportDocumentSchema,
  commonNoteShape,
} from '../format/schema';
import { buildImportJsonSchema, importJsonSchemaText } from './json-schema';
import { committedSchema, fixtures } from './test/files';

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const validate = ajv.compile(buildImportJsonSchema());

const note = { type: 'basic', front: 'Rôle du FCS ?', back: 'Détecter les erreurs.' };
const doc = (extra: Record<string, unknown>): Record<string, unknown> => ({
  format: 'mnemo/1',
  notes: [note],
  ...extra,
});

/** Hand-written documents, valid and invalid (no whitespace-only strings: Zod trims, JSON Schema does not). */
const HAND_WRITTEN: readonly unknown[] = [
  doc({}),
  doc({ format: 'mnemo/2' }),
  doc({ notes: [] }),
  doc({ extra: true }),
  doc({ meta: { title: 'x', language: 'fr', generator: 'ia' } }),
  doc({ meta: { author: 'x' } }),
  doc({ defaults: { deck: 'A::B', tags: ['a'], type: 'basic' } }),
  doc({ decks: [{ path: 'A', preset: 'Examen' }] }),
  doc({ decks: [{ name: 'A' }] }),
  doc({ media: [{ id: 'fig-1', file: 'media/fig.png' }] }),
  doc({ media: [{ id: 'fig-1', file: 'media/fig.png', data: 'data:image/png;base64,AAAA' }] }),
  doc({ media: [{ id: 'fig 1', file: 'x' }] }),
  doc({ media: [{ id: 'fig-1' }] }),
  doc({
    noteTypes: [
      {
        id: 'vocab',
        name: 'Vocab',
        fields: ['Mot'],
        templates: [{ name: 'T', front: '{{Mot}}', back: '' }],
      },
    ],
  }),
  doc({ noteTypes: [{ id: 'vocab', name: 'Vocab', fields: [], templates: [] }] }),
  doc({ continuation: null }),
  doc({ continuation: 3 }),
  doc({ notes: [{ type: 'basic', front: 'a' }] }),
  doc({ notes: [{ type: 'basic', front: 'a', back: 'b', uid: 'bad uid' }] }),
  doc({ notes: [{ type: 'basic', front: 'a', back: 'b', difficulty: 6 }] }),
  doc({ notes: [{ type: 'basic', front: 'a', back: 'b', difficulty: 2.5 }] }),
  doc({
    notes: [
      {
        type: 'basic',
        front: 'a',
        back: 'b',
        hint: ['x', 'y'],
        tags: 'a b',
        source: { doc: 'c', page: 3 },
      },
    ],
  }),
  doc({ notes: [{ type: 'basic', front: 'a', back: 'b', source: { chapter: 1 } }] }),
  doc({ notes: [{ type: 'qcm', question: 'q', choices: ['a', 'b'] }] }),
  doc({ notes: [{ type: 'mcq', question: 'q', choices: ['a'] }] }),
  doc({ notes: [{ type: 'mcq', question: 'q', choices: ['a', 'b'], answers: ['A', 2] }] }),
  doc({
    notes: [{ type: 'mcq', question: 'q', choices: [{ text: 'a', correct: true, why: 'x' }, 'b'] }],
  }),
  doc({ notes: [{ type: 'truefalse', statement: 's', answer: 'vrai' }] }),
  doc({
    notes: [
      {
        type: 'matching',
        pairs: [
          { left: 'a', right: 'b' },
          { left: 'c', right: 'd' },
        ],
      },
    ],
  }),
  doc({ notes: [{ type: 'matching', pairs: [{ left: 'a', right: 'b' }] }] }),
  doc({ notes: [{ type: 'ordering', question: 'q', steps: ['a'] }] }),
  doc({ notes: [{ type: 'list', question: 'q', items: ['a'], ordered: 'yes' }] }),
  doc({ notes: [{ type: 'custom:vocab', fields: { Mot: 'chat' } }] }),
  doc({ notes: [{ type: 'custom:', fields: {} }] }),
  doc({ notes: [{ type: 'cloze', text: 'a {{c1::b}}', front: 'x' }] }),
  [note],
  'mnemo/1',
];

function fixtureDocuments(): unknown[] {
  const docs: unknown[] = [];
  for (const [name, text] of fixtures) {
    if (name.endsWith('.expected.json')) continue;
    try {
      if (name.endsWith('.json')) docs.push(JSON.parse(text));
      else if (name.endsWith('.yaml')) docs.push(parseYaml(text));
    } catch {
      // Not canonical (needs cleanup): skipped.
    }
  }
  return docs;
}

describe('JSON Schema', () => {
  it('the committed schema is up to date (run `pnpm --filter @mnemo/importers schema`)', () => {
    expect(committedSchema).toBe(importJsonSchemaText());
  });

  it('has an id, a title and the 2020-12 dialect', () => {
    const schema = buildImportJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('https://mnemo.example/schema/mnemo-import.schema.json');
    expect(typeof schema.title).toBe('string');
  });

  it('accepts and rejects the same documents as Zod', () => {
    const docs = [...fixtureDocuments(), ...HAND_WRITTEN];
    expect(docs.length).toBeGreaterThan(50);
    let accepted = 0;
    for (const d of docs) {
      const zod = ImportDocumentSchema.safeParse(d).success;
      expect(validate(d), JSON.stringify(d).slice(0, 300)).toBe(zod);
      if (zod) accepted++;
    }
    expect(accepted).toBeGreaterThan(15);
  });
});

describe('NOTE_TYPE_DOCS', () => {
  const COMMON = new Set([...Object.keys(commonNoteShape), 'type']);
  /** Keys deliberately left out of the documentation (alternative input forms). */
  const UNDOCUMENTED: Readonly<Record<string, readonly string[]>> = { mcq: ['answers'] };

  it.each(IMPORT_NOTE_TYPES)(
    '%s lists exactly the schema keys with matching optionality',
    (type) => {
      const shape = BUILTIN_NOTE_SCHEMAS[type].shape as Record<
        string,
        { isOptional: () => boolean }
      >;
      const own = Object.keys(shape).filter(
        (k) => !COMMON.has(k) && !(UNDOCUMENTED[type] ?? []).includes(k),
      );
      const docs = NOTE_TYPE_DOCS[type];
      expect(docs.type).toBe(type);
      expect(docs.fields.map((f) => f.key).sort()).toEqual(own.sort());
      for (const field of docs.fields)
        expect(shape[field.key]?.isOptional(), field.key).toBe(!field.required);
      expect(BUILTIN_NOTE_SCHEMAS[type].safeParse(docs.example).success).toBe(true);
      expect(validate({ format: 'mnemo/1', notes: [docs.example] })).toBe(true);
    },
  );

  it('documents every common key as optional', () => {
    // `media` (ids of declared media) is not in COMMON_FIELD_DOCS yet: images are referenced inline.
    const undocumented = ['media'];
    const expected = Object.keys(commonNoteShape).filter((k) => !undocumented.includes(k));
    expect(COMMON_FIELD_DOCS.map((f) => f.key).sort()).toEqual(expected.sort());
    for (const field of COMMON_FIELD_DOCS) expect(field.required).toBe(false);
  });
});
