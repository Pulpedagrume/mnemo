import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { seededRng } from '../rng';
import { builtinNoteType } from './builtins';
import { mcqDisplayOrder, shuffleOrdering } from './interactive';
import { createNoteTypeRegistry } from './registry';
import { ANSWER_SEPARATOR, renderCard } from './render';
import { CardRenderError, type NoteContent, type NoteTypeLike, type NoteTypeSpec } from './types';

const type = (id: string): NoteTypeSpec => {
  const t = builtinNoteType(id);
  if (!t) throw new Error(id);
  return t;
};

describe('renderCard: template-based', () => {
  const qa: NoteContent = {
    fields: { front: 'Capitale ?', back: 'Paris' },
    hints: ['ville'],
    explanation: 'Depuis 987.',
  };

  it('basic', () => {
    expect(renderCard(qa, type('basic'), 0)).toEqual({
      kind: 'basic',
      front: 'Capitale ?',
      back: `Capitale ?${ANSWER_SEPARATOR}Paris`,
      hints: ['ville'],
      explanation: 'Depuis 987.',
    });
    expect(() => renderCard(qa, type('basic'), 1)).toThrow(CardRenderError);
  });

  it('basic_reversed', () => {
    const card = renderCard(qa, type('basic_reversed'), 1);
    expect(card.front).toBe('Paris');
    expect(card.back).toBe(`Paris${ANSWER_SEPARATOR}Capitale ?`);
  });

  it('custom template, including cloze templates', () => {
    const t: NoteTypeLike = {
      id: 'c',
      renderer: 'template',
      fields: [{ name: 'Body' }],
      templates: [{ name: 'c', front: '{{cloze:Body}}', back: '{{cloze:Body}}' }],
    };
    const n: NoteContent = { fields: { body: '{{c1::a::h1}} {{c2::b}}' }, hints: ['n'] };
    expect(renderCard(n, t, 1)).toMatchObject({
      front: 'a **[…]**',
      back: 'a **b**',
      hints: ['n'],
    });
    expect(renderCard(n, t, 0).hints).toEqual(['h1', 'n']);
    expect(() => renderCard(n, t, 2)).toThrow(CardRenderError);
  });

  it('ignores a blank explanation', () => {
    expect(renderCard({ ...qa, explanation: ' ' }, type('basic'), 0).explanation).toBeUndefined();
  });
});

describe('renderCard: cloze', () => {
  const n: NoteContent = {
    fields: { text: 'Le {{c1::cœur::organe}} pompe le {{c2::sang}}.', extra: 'Anatomie' },
    hints: ['Pensez au corps'],
  };

  it('puts the cloze hint before the note hints', () => {
    const card = renderCard(n, type('cloze'), 0);
    expect(card).toEqual({
      kind: 'cloze',
      front: 'Le **[organe]** pompe le sang.',
      back: 'Le **cœur** pompe le sang.',
      hints: ['organe', 'Pensez au corps'],
      extra: 'Anatomie',
    });
    expect(renderCard(n, type('cloze'), 1).hints).toEqual(['Pensez au corps']);
  });

  it('throws for an ord without cloze', () => {
    expect(() => renderCard(n, type('cloze'), 4)).toThrow(/no cloze c5/);
  });
});

describe('renderCard: interactive', () => {
  it('typed: the front never contains the answer', () => {
    const n: NoteContent = {
      fields: { front: 'Capitale de l’Italie ?' },
      data: { kind: 'typed', answers: ['Rome', 'Roma'], caseSensitive: false, ignoreAccents: true },
      hints: [],
    };
    const card = renderCard(n, type('typed'), 0);
    expect(card.front).not.toContain('Rome');
    expect(JSON.stringify(card.interactive)).not.toContain('Rom');
    expect(card.interactive).toEqual({ kind: 'typed', caseSensitive: false, ignoreAccents: true });
    expect(card.back).toBe(`Capitale de l’Italie ?${ANSWER_SEPARATOR}**Rome** / **Roma**`);
  });

  const mcq: NoteContent = {
    fields: { question: 'Protocoles de couche 4 ?' },
    data: {
      kind: 'mcq',
      shuffle: true,
      choices: [
        { text: 'TCP', correct: true, explanation: 'Fiable' },
        { text: 'IP', correct: false },
        { text: 'UDP', correct: true },
        { text: 'HTTP', correct: false },
      ],
    },
    hints: [],
  };

  it('mcq: shuffled choices with original indices, no correctness exposed', () => {
    const card = renderCard(mcq, type('mcq'), 0, { rng: seededRng(3) });
    expect(card.front).toBe('Protocoles de couche 4 ?');
    if (card.interactive?.kind !== 'mcq') throw new Error('expected mcq payload');
    expect(card.interactive.multiple).toBe(true);
    expect(card.interactive.choices.map((c) => c.index).sort()).toEqual([0, 1, 2, 3]);
    for (const c of card.interactive.choices) expect(c).toEqual({ index: c.index, text: c.text });
    expect(JSON.stringify(card.interactive)).not.toContain('correct');
    expect(card.back).toContain('- ✓ **TCP** — Fiable');
    expect(card.back).toContain('- ✗ IP');
    // Without an injected Rng the order is deterministic.
    expect(renderCard(mcq, type('mcq'), 0)).toEqual(renderCard(mcq, type('mcq'), 0));
  });

  it('mcq: keeps the original order when shuffle is off', () => {
    const order = mcqDisplayOrder(
      [
        { text: 'a', correct: true },
        { text: 'b', correct: false },
      ],
      false,
      seededRng(1),
    );
    expect(order).toEqual([
      { index: 0, text: 'a' },
      { index: 1, text: 'b' },
    ]);
  });

  it('truefalse: localized answer', () => {
    const n: NoteContent = {
      fields: { statement: 'Le Soleil est une étoile.' },
      data: { kind: 'truefalse', answer: true },
      hints: [],
    };
    expect(renderCard(n, type('truefalse'), 0).back).toBe(
      `Le Soleil est une étoile.${ANSWER_SEPARATOR}**Vrai**`,
    );
    const en = renderCard(
      { ...n, data: { kind: 'truefalse', answer: false } },
      type('truefalse'),
      0,
      {
        locale: 'en',
      },
    );
    expect(en.back).toContain('**False**');
    expect(en.interactive).toEqual({ kind: 'truefalse' });
  });

  it('matching: left items in order, distinct shuffled options', () => {
    const n: NoteContent = {
      fields: {},
      data: {
        kind: 'matching',
        pairs: [
          { left: 'France', right: 'Paris' },
          { left: 'Italie', right: 'Rome' },
          { left: 'Vatican', right: 'Rome' },
        ],
        distractors: ['Madrid'],
      },
      hints: [],
    };
    const card = renderCard(n, type('matching'), 0, { rng: seededRng(9) });
    if (card.interactive?.kind !== 'matching') throw new Error('expected matching payload');
    expect(card.interactive.left.map((l) => l.text)).toEqual(['France', 'Italie', 'Vatican']);
    expect([...card.interactive.right].sort()).toEqual(['Madrid', 'Paris', 'Rome']);
    expect(card.front).toBe('');
    expect(card.back).toBe('- France → **Paris**\n- Italie → **Rome**\n- Vatican → **Rome**');
  });

  it('ordering: shuffled steps that differ from the answer', () => {
    const n: NoteContent = {
      fields: { question: 'Ordre ?' },
      data: { kind: 'ordering', steps: ['un', 'deux', 'trois'] },
      hints: [],
    };
    for (let seed = 0; seed < 30; seed++) {
      const card = renderCard(n, type('ordering'), 0, { rng: seededRng(seed) });
      if (card.interactive?.kind !== 'ordering') throw new Error('expected ordering payload');
      expect(card.interactive.steps.map((s) => s.text)).not.toEqual(['un', 'deux', 'trois']);
    }
    expect(renderCard(n, type('ordering'), 0).back).toBe(
      `Ordre ?${ANSWER_SEPARATOR}1. un\n2. deux\n3. trois`,
    );
  });

  it('list: ordered and unordered', () => {
    const n: NoteContent = {
      fields: { question: 'Couleurs ?' },
      data: { kind: 'list', items: ['rouge', 'vert\net'], ordered: false },
      hints: ['trois'],
    };
    const card = renderCard(n, type('list'), 0);
    expect(card.interactive).toEqual({ kind: 'list', ordered: false, count: 2 });
    expect(card.back).toBe(`Couleurs ?${ANSWER_SEPARATOR}- rouge\n- vert et`);
    expect(card.hints).toEqual(['trois']);
    const ordered = renderCard(
      { ...n, data: { kind: 'list', items: ['a', 'b'], ordered: true } },
      type('list'),
      0,
    );
    expect(ordered.back).toContain('1. a\n2. b');
  });

  it('throws on a bad ord or missing data', () => {
    const n: NoteContent = { fields: { statement: 'x' }, hints: [] };
    expect(() => renderCard(n, type('truefalse'), 0)).toThrow(CardRenderError);
    const ok: NoteContent = { ...n, data: { kind: 'truefalse', answer: true } };
    expect(() => renderCard(ok, type('truefalse'), 1)).toThrow(CardRenderError);
  });

  it('uses a custom renderer from the registry', () => {
    const registry = createNoteTypeRegistry();
    const custom: NoteTypeSpec = { ...type('basic'), id: 'ext', builtin: false };
    registry.register({
      noteType: custom,
      render: () => ({ kind: 'basic', front: 'F', back: 'B', hints: [] }),
    });
    const card = renderCard({ fields: {}, explanation: 'E' }, custom, 0, {}, registry);
    expect(card).toEqual({ kind: 'basic', front: 'F', back: 'B', hints: [], explanation: 'E' });
  });
});

describe('shuffleOrdering', () => {
  it('is a permutation that differs from the original for length >= 2', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 12 }),
        fc.integer(),
        (steps, seed) => {
          const out = shuffleOrdering(seededRng(seed), steps);
          expect(out.map((s) => s.index).sort((a, b) => a - b)).toEqual(steps.map((_, i) => i));
          for (const s of out) expect(s.text).toBe(steps[s.index]);
          expect(out.map((s) => s.text)).not.toEqual(steps);
        },
      ),
    );
  });

  it('cannot change a sequence of identical steps', () => {
    expect(shuffleOrdering(seededRng(1), ['a', 'a']).map((s) => s.text)).toEqual(['a', 'a']);
    expect(shuffleOrdering(seededRng(1), ['a']).map((s) => s.index)).toEqual([0]);
  });
});
