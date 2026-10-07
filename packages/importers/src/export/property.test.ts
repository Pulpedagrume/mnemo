import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse as parseYaml } from 'yaml';
import type { BuiltinNoteTypeId, Note, NoteData } from '@mnemo/core';
import { ImportDocumentSchema, ImportNoteSchema } from '../format/schema';
import { buildImportDocument, exportDocument, noteToImportNote } from '.';
import { CUSTOM_TYPE, builtinType, makeNote } from './test/fixtures';

const txt = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== '');
const multiline = fc
  .array(fc.oneof(txt, fc.constantFrom('Q: x', ':::', '```', '$$', '- [x] y', '@deck Z')), {
    minLength: 1,
    maxLength: 4,
  })
  .map((lines) => lines.join('\n'))
  .filter((s) => s.trim() !== '');
const uid = fc.stringMatching(/^[A-Za-z0-9._:-]{1,20}$/);

const dataFor = (type: BuiltinNoteTypeId): fc.Arbitrary<NoteData | undefined> => {
  switch (type) {
    case 'typed':
      return fc.record({
        kind: fc.constant('typed' as const),
        answers: fc.array(txt, { minLength: 1, maxLength: 3 }),
        caseSensitive: fc.boolean(),
        ignoreAccents: fc.boolean(),
      });
    case 'mcq':
      return fc.record({
        kind: fc.constant('mcq' as const),
        choices: fc.array(
          fc.record(
            { text: txt, correct: fc.boolean(), explanation: txt },
            { requiredKeys: ['text', 'correct'] },
          ),
          { minLength: 2, maxLength: 8 },
        ),
        shuffle: fc.boolean(),
      });
    case 'truefalse':
      return fc.record({ kind: fc.constant('truefalse' as const), answer: fc.boolean() });
    case 'matching':
      return fc.record({
        kind: fc.constant('matching' as const),
        pairs: fc.array(fc.record({ left: txt, right: txt }), { minLength: 2, maxLength: 12 }),
        distractors: fc.array(txt, { maxLength: 3 }),
      });
    case 'ordering':
      return fc.record({
        kind: fc.constant('ordering' as const),
        steps: fc.array(txt, { minLength: 2, maxLength: 12 }),
      });
    case 'list':
      return fc.record({
        kind: fc.constant('list' as const),
        items: fc.array(txt, { minLength: 1, maxLength: 6 }),
        ordered: fc.boolean(),
      });
    default:
      return fc.constant(undefined);
  }
};

const FIELDS: Record<BuiltinNoteTypeId, string[]> = {
  basic: ['front', 'back'],
  basic_reversed: ['front', 'back'],
  typed: ['front'],
  cloze: ['text'],
  mcq: ['question'],
  truefalse: ['statement'],
  matching: ['question'],
  ordering: ['question'],
  list: ['question'],
};

const noteArb = (type: BuiltinNoteTypeId): fc.Arbitrary<Note> =>
  fc
    .record(
      {
        uid,
        fields: fc.record(Object.fromEntries(FIELDS[type].map((k) => [k, multiline]))),
        extra: multiline,
        data: dataFor(type),
        tags: fc.array(fc.stringMatching(/^[a-z0-9_-]{1,10}$/), { maxLength: 3 }),
        hints: fc.array(multiline, { maxLength: 3 }),
        explanation: multiline,
        source: fc.record(
          { doc: txt, page: fc.oneof(txt, fc.integer()), section: txt, url: txt },
          { requiredKeys: [] },
        ),
        difficulty: fc.integer({ min: 1, max: 5 }),
        needsReview: fc.boolean(),
      },
      { requiredKeys: ['fields', 'data', 'tags', 'hints'] },
    )
    .map(({ extra, data, ...rest }) =>
      makeNote({
        ...rest,
        noteTypeId: type,
        fields: extra === undefined ? rest.fields : { ...rest.fields, extra },
        ...(data === undefined ? {} : { data }),
      }),
    );

const TYPES = Object.keys(FIELDS) as BuiltinNoteTypeId[];

describe('noteToImportNote (property)', () => {
  it.each(TYPES)('random %s notes always validate', (type) => {
    fc.assert(
      fc.property(noteArb(type), fc.string({ maxLength: 10 }), (note, deckPath) => {
        ImportNoteSchema.parse(noteToImportNote(note, builtinType(type), { deckPath }));
      }),
      { numRuns: 60 },
    );
  });

  it('random custom notes always validate', () => {
    fc.assert(
      fc.property(fc.record({ word: fc.string(), meaning: fc.string() }), (fields) => {
        const note = makeNote({ noteTypeId: 'vocab', fields });
        ImportNoteSchema.parse(noteToImportNote(note, CUSTOM_TYPE, { deckPath: '' }));
      }),
    );
  });

  it('random collections export to every format; JSON and YAML read back equal', () => {
    const entry = fc.constantFrom(...TYPES).chain((type) =>
      fc.record({
        note: noteArb(type),
        noteType: fc.constant(builtinType(type)),
        deckPath: fc.constantFrom('A', 'A::B', 'C'),
      }),
    );
    fc.assert(
      fc.property(fc.array(entry, { minLength: 1, maxLength: 6 }), (notes) => {
        const doc = buildImportDocument({ notes });
        const back: unknown = JSON.parse(exportDocument(doc, 'json').text);
        expect(back).toEqual(doc);
        ImportDocumentSchema.parse(back);
        expect(parseYaml(exportDocument(doc, 'yaml').text)).toEqual(doc);
        expect(exportDocument(doc, 'markdown').text).toMatch(/^---\n/);
        expect(exportDocument(doc, 'csv').text.split('\n')[0]).toMatch(/^type,deck/);
      }),
      { numRuns: 25 },
    );
  }, 30_000);
});
