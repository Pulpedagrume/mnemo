import { describe, expect, it } from 'vitest';
import { NoteDataSchema } from '@mnemo/core';
import { parseImport } from './pipeline';
import { readFixture } from './test/files';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);
const md = (text: string, strict = false) => parseImport(text, { format: 'markdown', strict });

describe('parseImport — Mnemo Markdown', () => {
  it('parses the specification example with zero errors', () => {
    const r = parseImport(readFixture('valid/spec-example.md'), { fileName: 'spec-example.md' });
    expect(r.report.issues).toEqual([]);
    expect(r.notes.map((n) => n.noteTypeId)).toEqual([
      'basic',
      'cloze',
      'mcq',
      'matching',
      'ordering',
    ]);
    const [basic, cloze, mcq, matching, ordering] = r.notes;
    expect(basic).toMatchObject({
      uid: 'eth-4-001',
      line: 9,
      deck: 'Réseaux::Ethernet',
      tags: ['ccna', 'ethernet', 'couche2'],
      fields: {
        front: 'Quel est le rôle du champ FCS ?',
        back: 'Détecter les erreurs de transmission (CRC).',
      },
      hints: ['Frame Check Sequence.'],
      explanation: 'Si la valeur CRC reçue diffère de la valeur recalculée, la trame est rejetée.',
    });
    expect(cloze?.fields.text).toContain('{{c1::source::source ou destination ?}}');
    expect(mcq?.data).toMatchObject({
      kind: 'mcq',
      choices: [{ correct: true }, { correct: false }, { correct: true }, { correct: false }],
    });
    expect(mcq?.fields.question).toBe(
      'Quelles propositions décrivent la fibre optique ? (plusieurs réponses)',
    );
    expect(matching?.data).toEqual({
      kind: 'matching',
      pairs: [
        { left: 'Câblage horizontal d’un bureau', right: 'Cuivre' },
        { left: 'Réseau fédérateur entre bâtiments', right: 'Fibre optique' },
        { left: 'Accès invité dans un café', right: 'Sans fil' },
      ],
      distractors: [],
    });
    expect(ordering?.data).toMatchObject({
      kind: 'ordering',
      steps: [
        'Réception de la trame entière',
        'Vérification du FCS',
        'Consultation de la table MAC',
        'Transmission sur le port de sortie',
      ],
    });
    expect(r.report.counts).toMatchObject({ notes: 5, valid: 5, cards: 5 });
    for (const n of r.notes)
      if (n.data) expect(NoteDataSchema.safeParse(n.data).success).toBe(true);
  });

  it('keeps fenced code and math opaque, multi-line values and repeated hints', () => {
    const r = md(
      [
        '# Chapitre 3 — titre ignoré',
        'Du texte libre ignoré.',
        '::: basic',
        'Q: Que fait ce code ?',
        '```python',
        'Note: ceci n’est pas un champ',
        ':::',
        '```',
        'A: Il affiche',
        '',
        'deux lignes.',
        '$$',
        'Back: x^2',
        '$$',
        'Hint: premier',
        'Indice: second',
        ':::',
      ].join('\n'),
    );
    expect(r.report.issues).toEqual([]);
    expect(r.notes[0]?.fields.front).toBe(
      'Que fait ce code ?\n```python\nNote: ceci n’est pas un champ\n:::\n```',
    );
    expect(r.notes[0]?.fields.back).toBe('Il affiche\n\ndeux lignes.\n$$\nBack: x^2\n$$');
    expect(r.notes[0]?.hints).toEqual(['premier', 'second']);
  });

  it('reads every interactive type and directive', () => {
    const r = md(
      [
        '@deck Biologie :: Génétique',
        '@tags adn',
        '::: typed uid=bio-1 caseSensitive=true',
        'Question: Base complémentaire de A dans l’ADN ?',
        'Réponse: T | thymine',
        ':::',
        '::: truefalse',
        'Statement: L’ARN contient de l’uracile.',
        'Answer: vrai',
        ':::',
        '::: list ordered=true tags="l1 bio"',
        'Q: Cite les bases de l’ADN.',
        '1. Adénine',
        '2. Thymine',
        '   (avec A)',
        ':::',
        '::: matching',
        'Q: Associe.',
        '- ADN => désoxyribose',
        '- ARN => ribose',
        'Distractors:',
        '- glucose',
        ':::',
        '@continuation chapitre 4 : la mitose',
      ].join('\n'),
    );
    expect(r.report.issues.map((i) => i.code)).toEqual(['continuation']);
    expect(r.report.continuation).toBe('chapitre 4 : la mitose');
    const [typed, tf, list, matching] = r.notes;
    expect(typed).toMatchObject({
      deck: 'Biologie::Génétique',
      tags: ['adn'],
      data: { kind: 'typed', answers: ['T', 'thymine'], caseSensitive: true, ignoreAccents: true },
    });
    expect(tf?.data).toEqual({ kind: 'truefalse', answer: true });
    expect(list).toMatchObject({
      tags: ['adn', 'l1', 'bio'],
      data: { kind: 'list', items: ['Adénine', 'Thymine\n(avec A)'], ordered: true },
    });
    expect(matching?.data).toMatchObject({ distractors: ['glucose'] });
  });

  it('tolerates spacing variants with warnings', () => {
    const r = md(':::   mcq\nQ : Quelle couche ?\n* [x] Liaison\n+ [ ] Physique\n:::\n');
    expect(codes(r)).toEqual([
      'markdown_spacing_fixed',
      'markdown_spacing_fixed',
      'markdown_spacing_fixed',
    ]);
    expect(r.notes).toHaveLength(1);
    const strict = md(':::   mcq\nQ : Quelle couche ?\n- [x] Liaison\n- [ ] Physique\n:::\n', true);
    expect(strict.report.issues.every((i) => i.severity === 'error')).toBe(true);
    expect(strict.notes).toHaveLength(0);
  });

  it('reports structure errors with line numbers', () => {
    const r = md(
      'intro\n:::\n::: basic\nQ: a b c\nA: b\n::: basic uid=x-2\nQ: c d e\nA: d\n:::\n::: flashcrad\nQ: x y z\nA: y\n:::\n',
    );
    expect(r.report.issues.map((i) => [i.code, i.line])).toEqual([
      ['orphan_block_end', 2],
      ['unclosed_block', 3],
      ['unknown_type', 10],
    ]);
    expect(r.notes.map((n) => n.uid)).toEqual(['x-2']);
  });

  it('treats an unclosed final block as a truncation', () => {
    const r = md(
      '::: basic uid=a-1\nQ: Un ?\nA: 1\n:::\n::: basic uid=a-2\nQ: Deux ?\nA: 2\n:::\n::: basic uid=a-3\nQ: Trois',
    );
    expect(codes(r)).toEqual(['truncated']);
    expect(r.report.truncated).toEqual({ recovered: 2, lastUid: 'a-2' });
    expect(r.notes).toHaveLength(2);
  });

  it('reports text outside fields and unknown header text', () => {
    const r = md('::: basic note libre\nTexte perdu\nQ: Une question ?\nA: Oui\n:::');
    expect(codes(r)).toEqual(['unknown_key', 'unknown_field']);
    expect(r.notes).toHaveLength(1);
  });

  it('handles custom note types', () => {
    const r = md('::: custom:vocab\nMot: chat\nTraduction: cat\nHint: animal\n:::');
    expect(r.notes[0]).toMatchObject({
      noteTypeId: 'custom:vocab',
      fields: { mot: 'chat', traduction: 'cat' },
      hints: ['animal'],
    });
  });
});
