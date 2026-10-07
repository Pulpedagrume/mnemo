import { describe, expect, it } from 'vitest';
import { NoteTypeSchema } from '../model/noteType';
import {
  BUILTIN_NOTE_TYPE_IDS,
  BUILTIN_NOTE_TYPES,
  builtinNoteType,
  builtinNoteTypeRecords,
  fieldKey,
  getField,
  isBuiltinNoteTypeId,
  primaryFieldKey,
} from './builtins';
import { diffCardOrds, generateCardOrds } from './generate';
import { createNoteTypeRegistry, noteTypeRegistry, registerNoteType } from './registry';
import type { NoteContent, NoteTypeLike, NoteTypeSpec } from './types';

const type = (id: string): NoteTypeSpec => {
  const t = builtinNoteType(id);
  if (!t) throw new Error(id);
  return t;
};
const note = (fields: Record<string, string>, data?: NoteContent['data']): NoteContent =>
  data ? { fields, data, hints: [] } : { fields, hints: [] };

describe('built-in note types', () => {
  it('exposes stable ids and valid records', () => {
    expect(BUILTIN_NOTE_TYPES.map((t) => t.id)).toEqual([...BUILTIN_NOTE_TYPE_IDS]);
    for (const record of builtinNoteTypeRecords(1_000)) {
      expect(NoteTypeSchema.parse(record)).toEqual(record);
      expect(record).toMatchObject({ builtin: true, createdAt: 1_000, updatedAt: 1_000 });
    }
    expect(type('basic').templates).toHaveLength(1);
    expect(type('basic_reversed').templates).toHaveLength(2);
    expect(type('cloze').fields.map((f) => fieldKey(f.name))).toEqual(['text', 'extra']);
    expect(builtinNoteType('nope')).toBeUndefined();
    expect(isBuiltinNoteTypeId('mcq')).toBe(true);
    expect(isBuiltinNoteTypeId('custom')).toBe(false);
  });

  it('looks fields up case-insensitively', () => {
    expect(getField({ front: 'a' }, 'Front')).toBe('a');
    expect(getField({ Front: 'b' }, 'Front')).toBe('b');
    expect(getField({ FRONT: 'c' }, 'front')).toBe('c');
    expect(getField({}, 'Front')).toBe('');
  });

  it('knows the primary field of each renderer', () => {
    expect(BUILTIN_NOTE_TYPE_IDS.map((id) => primaryFieldKey(type(id)))).toEqual([
      'front',
      'front',
      'front',
      'text',
      'question',
      'statement',
      'question',
      'question',
      'question',
    ]);
    const empty: NoteTypeLike = { id: 'x', renderer: 'template', fields: [], templates: [] };
    expect(primaryFieldKey(empty)).toBe('');
  });
});

describe('registry', () => {
  it('holds the built-ins and refuses to override them', () => {
    const registry = createNoteTypeRegistry();
    expect(registry.list()).toHaveLength(BUILTIN_NOTE_TYPE_IDS.length);
    expect(registry.has('cloze')).toBe(true);
    expect(() => {
      registry.register({ noteType: type('basic') });
    }).toThrow(/built-in/);
    expect(registry.unregister('basic')).toBe(false);
  });

  it('registers extensions, in the default registry too', () => {
    const custom: NoteTypeSpec = { ...type('basic'), id: 'ext', builtin: false };
    registerNoteType({ noteType: custom, generate: () => [0, 5] });
    expect(noteTypeRegistry.get('ext')?.noteType.id).toBe('ext');
    expect(generateCardOrds(note({}), custom)).toEqual([0, 5]);
    expect(noteTypeRegistry.unregister('ext')).toBe(true);
    expect(noteTypeRegistry.unregister('ext')).toBe(false);
  });
});

describe('generateCardOrds', () => {
  it('basic: one card when the front is filled', () => {
    expect(generateCardOrds(note({ front: 'Q', back: 'A' }), type('basic'))).toEqual([0]);
    expect(generateCardOrds(note({ front: ' ', back: 'A' }), type('basic'))).toEqual([]);
  });

  it('basic_reversed: two cards, the reverse only with a back', () => {
    const t = type('basic_reversed');
    expect(generateCardOrds(note({ front: 'Q', back: 'A' }), t)).toEqual([0, 1]);
    expect(generateCardOrds(note({ front: 'Q', back: '' }), t)).toEqual([0]);
  });

  it('cloze: one card per distinct number, ord = n - 1', () => {
    const t = type('cloze');
    expect(generateCardOrds(note({ text: '{{c1::a}} {{c3::b}} {{c1::c}}' }), t)).toEqual([0, 2]);
    expect(generateCardOrds(note({ text: 'none' }), t)).toEqual([]);
  });

  it('interactive types: one card when data matches the renderer', () => {
    const cases: [string, NoteContent['data']][] = [
      ['typed', { kind: 'typed', answers: ['a'], caseSensitive: false, ignoreAccents: true }],
      [
        'mcq',
        {
          kind: 'mcq',
          shuffle: false,
          choices: [
            { text: 'a', correct: true },
            { text: 'b', correct: false },
          ],
        },
      ],
      ['truefalse', { kind: 'truefalse', answer: true }],
      [
        'matching',
        {
          kind: 'matching',
          pairs: [
            { left: 'a', right: '1' },
            { left: 'b', right: '2' },
          ],
          distractors: [],
        },
      ],
      ['ordering', { kind: 'ordering', steps: ['a', 'b'] }],
      ['list', { kind: 'list', items: ['a'], ordered: false }],
    ];
    for (const [id, data] of cases) {
      expect(generateCardOrds(note({ question: 'Q' }, data), type(id))).toEqual([0]);
      expect(generateCardOrds(note({ question: 'Q' }), type(id))).toEqual([]);
    }
    expect(generateCardOrds(note({}, { kind: 'truefalse', answer: true }), type('mcq'))).toEqual(
      [],
    );
  });

  it('template: one card per template with a non-empty front', () => {
    const t: NoteTypeLike = {
      id: 'vocab',
      renderer: 'template',
      fields: [{ name: 'Word' }, { name: 'Meaning' }, { name: 'Audio' }],
      templates: [
        { name: 'recognition', front: '{{Word}}', back: '{{FrontSide}} {{Meaning}}' },
        { name: 'recall', front: '{{#Meaning}}{{Meaning}}{{/Meaning}}', back: '{{Word}}' },
        { name: 'listening', front: '{{#Audio}}{{Audio}}{{/Audio}}', back: '{{Word}}' },
      ],
    };
    expect(generateCardOrds(note({ word: 'dog', meaning: 'chien' }), t)).toEqual([0, 1]);
  });

  it('template with {{cloze:}}: one card per cloze number', () => {
    const t: NoteTypeLike = {
      id: 'my-cloze',
      renderer: 'template',
      fields: [{ name: 'Body' }, { name: 'More' }],
      templates: [{ name: 'c', front: '{{cloze:Body}} {{cloze:More}}', back: '{{cloze:Body}}' }],
    };
    expect(generateCardOrds(note({ body: '{{c2::a}}', more: '{{c1::b}} {{c2::c}}' }), t)).toEqual([
      0, 1,
    ]);
  });
});

describe('diffCardOrds', () => {
  it('computes cards to create and delete', () => {
    expect(diffCardOrds([0, 1, 2], [1, 3, 3, 4])).toEqual({ toCreate: [3, 4], toDelete: [0, 2] });
    expect(diffCardOrds([], [0])).toEqual({ toCreate: [0], toDelete: [] });
    expect(diffCardOrds([2, 0], [0, 2])).toEqual({ toCreate: [], toDelete: [] });
  });
});
