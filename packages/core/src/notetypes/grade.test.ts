import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffChars, normalizeAnswer, tidyAnswer } from './diff';
import {
  gradeList,
  gradeMatching,
  gradeMcq,
  gradeOrdering,
  gradeTrueFalse,
  gradeTyped,
  MCQ_STATUS_LABELS,
} from './grade';

describe('gradeMcq', () => {
  const choices = [
    { text: 'TCP', correct: true },
    { text: 'IP', correct: false },
    { text: 'UDP', correct: true },
    { text: 'HTTP', correct: false },
  ];

  it('is correct when exactly the right choices are selected', () => {
    const r = gradeMcq(choices, [2, 0]);
    expect(r.correct).toBe(true);
    expect(r.suggestedRating).toBe(3);
    expect(r.details.choices.map((c) => c.status)).toEqual([
      'correct',
      'neutral',
      'correct',
      'neutral',
    ]);
  });

  it('labels wrong and missed choices', () => {
    const r = gradeMcq(choices, [0, 1, 9]);
    expect(r.correct).toBe(false);
    expect(r.suggestedRating).toBe(1);
    expect(r.details.choices).toEqual([
      { index: 0, selected: true, status: 'correct', label: MCQ_STATUS_LABELS.correct },
      { index: 1, selected: true, status: 'wrong', label: MCQ_STATUS_LABELS.wrong },
      { index: 2, selected: false, status: 'missed', label: MCQ_STATUS_LABELS.missed },
      { index: 3, selected: false, status: 'neutral' },
    ]);
    expect(MCQ_STATUS_LABELS).toEqual({
      correct: { fr: 'Bonne réponse', en: 'Correct' },
      wrong: { fr: 'Erreur', en: 'Wrong' },
      missed: { fr: 'À choisir', en: 'Should be selected' },
    });
  });

  it('is wrong when nothing is selected', () => {
    expect(gradeMcq(choices, []).correct).toBe(false);
  });
});

describe('gradeTrueFalse', () => {
  it('compares the choice with the answer', () => {
    expect(gradeTrueFalse(true, true)).toEqual({
      correct: true,
      suggestedRating: 3,
      details: { expected: true, chosen: true },
    });
    expect(gradeTrueFalse(false, true).suggestedRating).toBe(1);
  });
});

describe('gradeMatching', () => {
  const pairs = [
    { left: 'France', right: 'Paris' },
    { left: 'Italie', right: 'Rome' },
    { left: 'Vatican', right: 'Rome' },
  ];

  it('grades each pair', () => {
    const r = gradeMatching(pairs, { 0: 'Paris', 1: 'Madrid', 2: null });
    expect(r.correct).toBe(false);
    expect(r.details.pairs.map((p) => p.status)).toEqual(['correct', 'wrong', 'missing']);
    expect(r.details.pairs[1]).toEqual({
      index: 1,
      expected: 'Rome',
      given: 'Madrid',
      status: 'wrong',
    });
    expect(gradeMatching(pairs, { 0: 'Paris', 1: 'Rome', 2: 'Rome' }).correct).toBe(true);
    expect(gradeMatching(pairs, { 0: 'Paris', 1: 'Rome' }).details.pairs[2]?.status).toBe(
      'missing',
    );
  });
});

describe('gradeOrdering', () => {
  const steps = ['a', 'b', 'c'];

  it('grades each position', () => {
    expect(gradeOrdering(steps, [0, 1, 2]).correct).toBe(true);
    const r = gradeOrdering(steps, [1, 0, 2]);
    expect(r.correct).toBe(false);
    expect(r.details.positions.map((p) => p.correct)).toEqual([false, false, true]);
    expect(r.details.positions[0]).toEqual({
      position: 0,
      expectedIndex: 0,
      givenIndex: 1,
      correct: false,
    });
  });

  it('handles incomplete or invalid submissions and duplicate steps', () => {
    const r = gradeOrdering(steps, [0, 7]);
    expect(r.correct).toBe(false);
    expect(r.details.positions.map((p) => p.givenIndex)).toEqual([0, null, null]);
    expect(gradeOrdering(['x', 'x', 'y'], [1, 0, 2]).correct).toBe(true);
  });
});

describe('gradeList', () => {
  const items = ['Rouge', 'Vert', 'Bleu'];

  it('returns null when the answer was only revealed', () => {
    expect(gradeList(items, undefined, false)).toBeNull();
  });

  it('matches typed items leniently in any order', () => {
    const r = gradeList(items, ['bleu ', 'ROUGE', '', 'vert'], false);
    expect(r?.correct).toBe(true);
    expect(r?.details.inOrder).toBeUndefined();
  });

  it('reports missing and extra items', () => {
    const r = gradeList(items, ['rouge', 'jaune', 'rouge'], false);
    expect(r?.correct).toBe(false);
    expect(r?.details).toEqual({
      matched: [{ itemIndex: 0, typed: 'rouge' }],
      missing: [1, 2],
      extra: ['jaune', 'rouge'],
    });
  });

  it('checks the order of ordered lists', () => {
    expect(gradeList(items, ['rouge', 'vert', 'bleu'], true)?.correct).toBe(true);
    const r = gradeList(items, ['vert', 'rouge', 'bleu'], true);
    expect(r?.correct).toBe(false);
    expect(r?.details.inOrder).toBe(false);
  });

  it('matches accented items regardless of accents', () => {
    expect(gradeList(['Été'], ['ete'], false)?.correct).toBe(true);
  });
});

describe('gradeTyped', () => {
  const loose = { caseSensitive: false, ignoreAccents: true };
  const strict = { caseSensitive: true, ignoreAccents: false };

  it('accepts any variant after normalization', () => {
    expect(gradeTyped('  le   Havre ', ['Le Havre'], loose).correct).toBe(true);
    expect(gradeTyped('ROMA', ['Rome', 'Roma'], loose).details.closest).toBe('Roma');
    expect(gradeTyped('Etat', ['État'], loose).correct).toBe(true);
    expect(gradeTyped('Etat', ['État'], strict).correct).toBe(false);
    expect(gradeTyped('état', ['État'], { caseSensitive: true, ignoreAccents: true }).correct).toBe(
      false,
    );
  });

  it('diffs the input against the closest variant', () => {
    const r = gradeTyped('Pari', ['Lyon', 'Paris'], strict);
    expect(r.correct).toBe(false);
    expect(r.suggestedRating).toBe(1);
    expect(r.details.closest).toBe('Paris');
    expect(r.details.segments).toEqual([
      { type: 'equal', text: 'Pari' },
      { type: 'missing', text: 's' },
    ]);
    expect(gradeTyped('Parxis', ['Paris'], strict).details.segments).toEqual([
      { type: 'equal', text: 'Par' },
      { type: 'extra', text: 'x' },
      { type: 'equal', text: 'is' },
    ]);
  });

  it('shows the expected spelling in equal segments', () => {
    expect(gradeTyped('etre', ['Être'], loose).details.segments).toEqual([
      { type: 'equal', text: 'Être' },
    ]);
  });

  it('handles empty answers and inputs', () => {
    expect(gradeTyped('abc', [], loose).details).toEqual({
      input: 'abc',
      closest: '',
      segments: [{ type: 'extra', text: 'abc' }],
    });
    expect(gradeTyped('', [], loose).details.segments).toEqual([]);
    expect(gradeTyped('', ['a'], loose).details.segments).toEqual([{ type: 'missing', text: 'a' }]);
  });

  it('caps inputs at 500 characters', () => {
    const long = 'a'.repeat(800);
    expect(tidyAnswer(long)).toHaveLength(500);
    expect(gradeTyped(long, ['a'.repeat(600)], strict).correct).toBe(true);
  });

  it('is always correct for the answer itself', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.boolean(),
        fc.boolean(),
        (answer, caseSensitive, ignoreAccents) => {
          expect(gradeTyped(answer, [answer], { caseSensitive, ignoreAccents }).correct).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('diff helpers', () => {
  it('normalizes answers', () => {
    expect(normalizeAnswer(' Ça  VA ', { caseSensitive: false, ignoreAccents: true })).toBe(
      'ca va',
    );
    expect(normalizeAnswer('é', { caseSensitive: true, ignoreAccents: false })).toBe('é');
  });

  it('diff segments rebuild both strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }), (a, b) => {
        const { segments } = diffChars(a, b, { caseSensitive: true, ignoreAccents: false });
        const typed = segments.filter((s) => s.type !== 'missing').map((s) => s.text);
        const expected = segments.filter((s) => s.type !== 'extra').map((s) => s.text);
        expect(typed.join('')).toBe(a);
        expect(expected.join('')).toBe(b);
      }),
    );
  });
});
