import { describe, expect, it } from 'vitest';
import { parseImport } from './pipeline';
import { sanitizeString } from './sanitize';
import { detectFormat } from './detect';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);
const json = (notes: unknown[], extra: Record<string, unknown> = {}) =>
  parseImport(JSON.stringify({ format: 'mnemo/1', ...extra, notes }), { format: 'json' });

describe('edge cases', () => {
  it('resolves MCQ answers given as choice texts, on object choices', () => {
    const r = json([
      {
        type: 'mcq',
        question: 'Quel gaz respirons-nous ?',
        choices: [
          { text: 'Azote' },
          { text: 'Dioxygène', explanation: 'Utilisé par les mitochondries.' },
        ],
        answers: ['dioxygene'],
      },
    ]);
    expect(codes(r)).toEqual(['answers_normalized']);
    expect(r.notes[0]?.data).toEqual({
      kind: 'mcq',
      choices: [
        { text: 'Azote', correct: false },
        { text: 'Dioxygène', correct: true, explanation: 'Utilisé par les mitochondries.' },
      ],
      shuffle: true,
    });
    expect(
      codes(
        json([{ type: 'mcq', question: 'Quel gaz ?', choices: ['a', 'b'], answers: [0, true] }]),
      ),
    ).toEqual(['mcq_bad_answer_ref', 'mcq_bad_answer_ref', 'answers_normalized', 'mcq_no_correct']);
  });

  it('reports invalid document sections and keeps the notes', () => {
    const r = json(
      [{ type: 'basic', front: 'Qu’est-ce qu’un gène ?', back: 'Un segment d’ADN.' }],
      {
        decks: 'Biologie',
        meta: { author: 'IA' },
        media: [{ id: 'fig-1' }],
        extraKey: 1,
        continuation: '   ',
      },
    );
    expect(codes(r)).toEqual(['unknown_key', 'invalid_value', 'invalid_value', 'unknown_key']);
    expect(r.notes).toHaveLength(1);
    expect(r.report.continuation).toBeUndefined();
    expect(codes(parseImport('{"format":"mnemo/1","notes":{}}'))).toEqual(['invalid_value']);
    expect(codes(parseImport('{"format":"mnemo/1"}'))).toEqual(['missing_field']);
  });

  it('normalizes sources, tags, decks, needsReview and custom types', () => {
    const r = json(
      [
        {
          type: 'basic',
          deck: ' Histoire ::  Rome :: ',
          tags: ['a,b', 'b c', 'x'.repeat(101)],
          front: 'Qui fonde Rome ?',
          back: 'Romulus',
          source: 'Manuel p. 12',
          needsReview: true,
          difficulty: 2,
        },
        {
          type: 'basic',
          front: 'Qui succède à César ?',
          back: 'Auguste',
          source: {
            doc: 'd'.repeat(600),
            page: 'p'.repeat(60),
            section: 'S',
            url: 'https://example.org',
          },
        },
        { type: 'custom:inconnu', fields: { Mot: 'chat' } },
        { type: 'mcq', question: 'Q ?', choices: ['a', 'b'], hint: 'pas a' },
      ],
      { defaults: { deck: 'Défaut', tags: 'revision', type: 'basic' } },
    );
    expect(codes(r)).toEqual(['invalid_value', 'mcq_no_correct']);
    expect(r.notes[0]).toMatchObject({
      deck: 'Histoire::Rome',
      tags: ['revision', 'a', 'b', 'c'],
      source: { doc: 'Manuel p. 12' },
      needsReview: true,
      difficulty: 2,
    });
    expect(r.notes[1]?.source).toMatchObject({ section: 'S', url: 'https://example.org' });
    expect(r.notes[1]?.source?.doc).toHaveLength(500);
    expect(r.notes[1]?.deck).toBe('Défaut');
    expect(r.notes[2]).toMatchObject({
      noteTypeId: 'custom:inconnu',
      cards: 1,
      fields: { mot: 'chat' },
    });
  });

  it('uses defaults.type for notes without type and reports notes that are not objects', () => {
    const r = json([{ front: 'Capitale de l’Italie ?', back: 'Rome' }, 'texte', { type: 42 }], {
      defaults: { type: 'basic' },
    });
    expect(codes(r)).toEqual(['invalid_value', 'unknown_type']);
    expect(codes(json([{ front: 'a', back: 'b' }]))).toEqual(['missing_field']);
  });

  it('reports wrong value types and long fields', () => {
    const r = json([
      { type: 'truefalse', statement: 'Le Soleil est une étoile.', answer: 'peut-être' },
      { type: 'list', question: 'Cite deux planètes.', items: 'Mars' },
      { type: 'basic', front: '', back: 'b' },
      {
        type: 'ordering',
        question: 'Ordre ?',
        steps: Array.from({ length: 13 }, (_, i) => `étape ${i}`),
      },
      { type: 'basic', front: 'Q ?', back: 'R', difficulty: 9 },
      { type: 'basic', front: 'Q ?', back: 'R', question: 'doublon' },
    ]);
    expect(codes(r)).toEqual([
      'invalid_value',
      'invalid_value',
      'missing_field',
      'invalid_value',
      'invalid_value',
      'unknown_key',
    ]);
    expect(r.report.issues[5]?.suggestion?.en).toContain('front');
  });

  it('reads Markdown front-matter options and attribute variants', () => {
    const r = parseImport(
      '---\nformat: mnemo/1\ntype: basic\nlanguage: fr\nauteur: moi\n---\n::: uid=x-1 deck=“Histoire::Égypte” difficulty=2 needsReview=true\nQ: Qui a construit la pyramide de Khéops ?\nA: Les Égyptiens, sous Khéops.\nSource: {"doc":"Manuel","page":4}\nQ: Bis ?\n:::\n::: matching\nQ: Associe.\n- Nil -> Égypte\n- Tibre\n:::\n',
      { format: 'markdown' },
    );
    expect(codes(r)).toEqual([
      'unknown_key',
      'invalid_value',
      'markdown_spacing_fixed',
      'invalid_value',
      'missing_field',
    ]);
    expect(r.meta).toEqual({ language: 'fr' });
    expect(r.notes[0]).toMatchObject({
      uid: 'x-1',
      deck: 'Histoire::Égypte',
      difficulty: 2,
      needsReview: true,
      source: { doc: 'Manuel', page: 4 },
    });
    expect(r.notes[0]?.fields.front).toBe('Qui a construit la pyramide de Khéops ?\n\nBis ?');
    expect(
      codes(
        parseImport('---\ndeck: [a\n---\n::: basic\nQ: a b c\nA: b\n:::', { format: 'markdown' }),
      ),
    ).toEqual(['parse_error']);
    expect(
      codes(
        parseImport('---\nformat: mnemo/9\n---\n::: basic\nQ: a b c\nA: b\n:::', {
          format: 'markdown',
        }),
      ),
    ).toEqual(['wrong_format_id']);
    expect(codes(parseImport('# Juste un titre\n', { format: 'markdown' }))).toEqual([
      'invalid_value',
    ]);
  });

  it('sanitizes only outside code', () => {
    expect(sanitizeString('a <iframe src="x"></iframe>b `<script>` [l](javascript:alert(1))')).toBe(
      'a b `<script>` [l](#alert(1))',
    );
    expect(sanitizeString('<img src=x onerror="a()" onload=b>')).toBe('<img src=x>');
    expect(sanitizeString('texte normal')).toBe('texte normal');
  });

  it('YAML: reports alias bombs and unknown anchors as parse errors', () => {
    expect(codes(parseImport('format: mnemo/1\nnotes: *x\n', { format: 'yaml' }))).toEqual([
      'parse_error',
    ]);
    expect(codes(parseImport('---\nnotes: [\n', { format: 'yaml', strict: true }))[0]).toBe(
      'parse_error',
    );
  });

  it('JSON: strict mode reports prose and truncation without repairing', () => {
    const r = parseImport(
      'Voici :\n{"format":"mnemo/1","notes":[{"type":"basic","front":"a b c","back":"b"},{"type":"ba',
      { format: 'json', strict: true },
    );
    expect(codes(r)).toEqual(['prose_removed', 'parse_error', 'truncated']);
    expect(r.report.issues.every((i) => i.severity === 'error')).toBe(true);
    expect(
      codes(parseImport('{"format":"mnemo/1","notes":[{"type":"ba', { format: 'json' })),
    ).toEqual(['truncated']);
    expect(codes(parseImport('{ ] }', { format: 'json' }))[0]).toBe('json_repaired');
  });

  it('detects formats from ambiguous content', () => {
    expect(detectFormat('Voici :\n\n  {"notes": []}')).toBe('json');
    expect(detectFormat('---\nformat: mnemo/1\nnotes:\n  - type: basic\n')).toBe('yaml');
    expect(detectFormat('```text\nbla\n```')).toBe('markdown');
  });
});
