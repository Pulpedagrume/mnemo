import { describe, expect, it } from 'vitest';
import { NoteDataSchema } from '@mnemo/core';
import { parseImport } from './pipeline';
import { detectFormat } from './detect';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);

const doc = (notes: unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: 'mnemo/1', ...extra, notes }, null, 2);

describe('detectFormat', () => {
  it('uses the extension first', () => {
    expect(detectFormat('{}', 'a.yaml')).toBe('yaml');
    expect(detectFormat('', 'a.YML')).toBe('yaml');
    expect(detectFormat('', 'notes.txt')).toBe('markdown');
    expect(detectFormat('', 'x.tsv')).toBe('csv');
    expect(detectFormat('', 'x.json')).toBe('json');
  });
  it('sniffs the content', () => {
    expect(detectFormat('Voici :\n```json\n{}\n```')).toBe('json');
    expect(detectFormat('```yaml\nnotes: []\n```')).toBe('yaml');
    expect(detectFormat('  {"format":"mnemo/1"}')).toBe('json');
    expect(detectFormat('format: mnemo/1\nnotes:\n  - type: basic')).toBe('yaml');
    expect(detectFormat('::: basic\nQ: a\nA: b\n:::')).toBe('markdown');
    expect(detectFormat('---\ndeck: A\n---\n\n::: basic\n:::')).toBe('markdown');
    expect(detectFormat('type;front;back\nbasic;a;b')).toBe('csv');
    expect(detectFormat('front\tback\nq\ta')).toBe('csv');
    expect(detectFormat('- type: basic\n  front: a')).toBe('yaml');
    expect(detectFormat('just some text')).toBe('markdown');
  });
});

describe('parseImport — JSON', () => {
  it('parses a canonical document with every type', () => {
    const r = parseImport(
      doc(
        [
          {
            type: 'basic',
            uid: 'n-1',
            front: 'Rôle du FCS ?',
            back: 'Détecter les erreurs.',
            hint: 'CRC',
            extra: 'Voir trame.',
          },
          { type: 'basic_reversed', front: 'FCS', back: 'Frame Check Sequence' },
          { type: 'typed', front: 'Commande ?', answer: ['show mac', 'sh mac'] },
          { type: 'cloze', text: 'Le {{c1::FCS}} et le {{c2::préambule}}.', extra: 'note' },
          {
            type: 'mcq',
            question: 'Quel support ?',
            choices: [{ text: 'Fibre', correct: true }, 'UTP'],
          },
          { type: 'truefalse', statement: 'Le FCS est au début.', answer: false },
          {
            type: 'matching',
            pairs: [
              { left: 'a', right: 'b' },
              { left: 'c', right: 'd' },
            ],
          },
          { type: 'ordering', question: 'Ordre ?', steps: ['un', 'deux'] },
          { type: 'list', question: 'Cite les supports.', items: ['cuivre'] },
          { type: 'custom:vocab', fields: { Word: 'chat', Meaning: 'cat' } },
        ],
        { defaults: { deck: 'Réseaux :: Ethernet', tags: 'ccna, l2' }, source: undefined },
      ),
    );
    expect(r.report.issues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(r.format).toBe('json');
    expect(r.notes).toHaveLength(10);
    expect(r.report.counts).toMatchObject({
      notes: 10,
      valid: 10,
      invalid: 0,
      cards: 12,
      errors: 0,
    });
    const [basic, , typed, cloze, mcq] = r.notes;
    expect(basic).toMatchObject({
      uid: 'n-1',
      deck: 'Réseaux::Ethernet',
      tags: ['ccna', 'l2'],
      hints: ['CRC'],
      explanation: 'Voir trame.',
      fields: { front: 'Rôle du FCS ?', back: 'Détecter les erreurs.' },
      line: 8,
    });
    expect(typed?.data).toEqual({
      kind: 'typed',
      answers: ['show mac', 'sh mac'],
      caseSensitive: false,
      ignoreAccents: true,
    });
    expect(cloze?.fields).toEqual({
      text: 'Le {{c1::FCS}} et le {{c2::préambule}}.',
      extra: 'note',
    });
    expect(cloze?.cards).toBe(2);
    expect(mcq?.data).toEqual({
      kind: 'mcq',
      choices: [
        { text: 'Fibre', correct: true },
        { text: 'UTP', correct: false },
      ],
      shuffle: true,
    });
    expect(r.notes[9]).toMatchObject({
      noteTypeId: 'custom:vocab',
      fields: { word: 'chat', meaning: 'cat' },
      cards: 1,
    });
    for (const n of r.notes)
      if (n.data) expect(NoteDataSchema.safeParse(n.data).success).toBe(true);
  });

  it('cleans AI noise: prose, fence, smart quotes, comments, trailing commas', () => {
    const text =
      'Voici votre fichier :\n```json\n{\n  “format”: “mnemo/1”, // id\n  "notes": [\n    { "type": "basic", "front": "Il dit “oui” ?", "back": "Oui", },\n  ],\n}\n```\nBonne révision !';
    const r = parseImport(text);
    expect(codes(r)).toEqual([
      'code_fence_extracted',
      'prose_removed',
      'smart_quotes_fixed',
      'comments_removed',
      'trailing_commas_removed',
    ]);
    expect(r.notes[0]?.fields.front).toBe('Il dit “oui” ?');
    expect(r.notes[0]?.line).toBe(6);
  });

  it('strict mode turns fixes into errors', () => {
    const r = parseImport(
      '{"format":"mnemo/1","notes":[{"type":"qcm","question":"Q ?","choices":["a","b"],"answers":["A"]}]}',
      { strict: true },
    );
    expect(r.report.issues[0]).toMatchObject({ code: 'unknown_type', severity: 'error' });
    expect(r.report.issues[0]?.suggestion?.en).toContain('mcq');
    expect(r.notes).toHaveLength(0);
  });

  it('applies type-aware aliases with warnings', () => {
    const r = parseImport(
      doc([
        {
          type: 'QCM',
          Question: 'Quel support ?',
          choices: ['Fibre', 'UTP', 'STP'],
          answers: ['a', 3],
        },
        { type: 'typed', question: 'Commande ?', réponse: 'show' },
        { type: 'vf', question: 'Le FCS est au début.', back: false },
        { type: 'flashcard', recto: 'Q1 ?', verso: 'R1' },
      ]),
    );
    expect(r.report.counts.errors).toBe(0);
    expect(r.notes.map((n) => n.noteTypeId)).toEqual(['mcq', 'typed', 'truefalse', 'basic']);
    expect(r.notes[0]?.data).toMatchObject({
      choices: [{ correct: true }, { correct: false }, { correct: true }],
    });
    expect(codes(r).filter((c) => c === 'answers_normalized')).toHaveLength(1);
    expect(r.report.issues.find((i) => i.code === 'alias')?.suggestion).toEqual({
      fr: 'type « QCM » → « mcq »',
      en: 'type "QCM" → "mcq"',
    });
    expect(r.notes[2]?.data).toEqual({ kind: 'truefalse', answer: false });
  });

  it('accepts a bare array with a warning and reports unknown keys and types', () => {
    const r = parseImport(
      '[{"type":"basic","front":"Q ?","back":"R","colour":"red"},{"type":"basci","front":"a","back":"b"}]',
    );
    expect(codes(r)).toEqual(['wrong_format_id', 'unknown_key', 'unknown_type']);
    expect(r.report.issues[2]?.suggestion?.en).toContain('basic');
    expect(r.report.issues[1]).toMatchObject({ path: 'notes[0].colour', noteIndex: 0, line: 1 });
    expect(r.report.counts).toMatchObject({ notes: 2, valid: 0, invalid: 2 });
  });

  it('reports missing fields, invalid values and uids', () => {
    const r = parseImport(
      doc([
        { type: 'basic', front: 'Question ?' },
        { type: 'basic', uid: 'a b', front: 'x y z', back: 'y' },
        { type: 'mcq', question: 'Q ?', choices: ['a'] },
      ]),
    );
    expect(codes(r)).toEqual(['missing_field', 'invalid_uid', 'mcq_choice_count']);
    expect(r.report.issues[0]?.path).toBe('notes[0].back');
  });

  it('recovers a truncated JSON output', () => {
    const notes = Array.from({ length: 5 }, (_, i) => ({
      type: 'basic',
      uid: `t-${i + 1}`,
      front: `Question ${i + 1} ?`,
      back: 'R',
    }));
    const full = doc(notes);
    const cut = full.slice(0, full.indexOf('"t-5"') + 10);
    const r = parseImport(cut);
    expect(r.notes).toHaveLength(4);
    expect(r.report.truncated).toEqual({ recovered: 4, lastUid: 't-4' });
    expect(codes(r)).toEqual(['truncated']);
  });

  it('reports a syntax error with its line', () => {
    const r = parseImport(
      '{\n "format": "mnemo/1",\n "notes": [ { "type": "basic" "front": "a" } ]\n}',
      { strict: true },
    );
    expect(r.report.issues[0]).toMatchObject({ code: 'parse_error', line: 3 });
  });

  it('repairs broken JSON as a last resort', () => {
    const r = parseImport(
      "{format: 'mnemo/1', notes: [{type: 'basic', front: 'Question ?', back: 'R'}]}",
    );
    expect(codes(r)).toContain('json_repaired');
    expect(r.notes).toHaveLength(1);
  });

  it('enforces limits and never throws', () => {
    expect(codes(parseImport('{}', { maxBytes: 1 }))).toEqual(['file_too_large']);
    const many = doc(
      Array.from({ length: 3 }, (_, i) => ({ type: 'basic', front: `Q${i} ?`, back: 'R' })),
    );
    const r = parseImport(many, { maxNotes: 2 });
    expect(codes(r)).toEqual(['too_many_notes']);
    expect(r.notes).toHaveLength(2);
    expect(codes(parseImport('', { format: 'json' }))).toEqual(['parse_error']);
    expect(codes(parseImport('"text"', { format: 'json' }))).toEqual(['not_a_document']);
  });

  it('reports continuation', () => {
    const r = parseImport(
      doc([{ type: 'basic', front: 'Q ?!', back: 'R' }], { continuation: 'Chapitre 5' }),
    );
    expect(r.report.continuation).toBe('Chapitre 5');
    expect(codes(r)).toEqual(['continuation']);
  });
});
