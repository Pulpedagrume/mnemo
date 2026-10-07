import { describe, expect, it } from 'vitest';
import type { CardMemory, Rating } from '../../model/card';
import { ctxFor, dayAt, genericCard, play, T0 } from '../test/helpers';
import { ParamValidationError } from '../types';
import { nextEasiness, sm2Scheduler as sm2 } from './sm2';

const run = (card: CardMemory, rating: Rating, params: object = {}) =>
  sm2.schedule(card, rating, ctxFor(sm2, { params })).card;

describe('sm2: easiness formula', () => {
  it.each([
    [5, 2.6],
    [4, 2.5],
    [3, 2.36],
    [2, 2.18],
    [1, 1.96],
    [0, 1.7],
  ])('q=%i gives EF %f from 2.5', (q, ef) => {
    expect(nextEasiness(2.5, q)).toBeCloseTo(ef);
  });
  it('is floored at 1.3', () => {
    expect(nextEasiness(1.35, 0)).toBe(1.3);
  });
});

describe('sm2: every state × rating', () => {
  it.each([
    [1, { interval: 1, step: 0, lapses: 0 }, 1.96],
    [2, { interval: 1, step: 1, lapses: 0 }, 2.36],
    [3, { interval: 1, step: 1, lapses: 0 }, 2.5],
    [4, { interval: 1, step: 1, lapses: 0 }, 2.6],
  ] as const)('new card, rating %i', (rating, expected, ef) => {
    const c = run(sm2.initCard({ now: T0 }), rating);
    expect(c).toMatchObject({ ...expected, state: 'review', due: dayAt(1), reps: 1 });
    expect(c.ease).toBeCloseTo(ef);
  });

  // genericCard('review'): interval 10, ease 2.5, step (n) 2, lapses 1.
  it.each([
    [1, { interval: 1, step: 0, lapses: 2 }],
    [2, { interval: 25, step: 3, lapses: 1 }],
    [3, { interval: 25, step: 3, lapses: 1 }],
    [4, { interval: 25, step: 3, lapses: 1 }],
  ] as const)('review card, rating %i', (rating, expected) => {
    const c = run(genericCard('review'), rating);
    expect(c).toMatchObject({ ...expected, state: 'review', due: dayAt(expected.interval) });
  });

  it.each(['learning', 'relearning'] as const)('%s card behaves like a review', (state) => {
    const card = genericCard(state);
    expect(run(card, 3)).toMatchObject({ state: 'review', interval: state === 'learning' ? 6 : 1 });
    expect(run(card, 1)).toMatchObject({ state: 'review', interval: 1, lapses: card.lapses + 1 });
    expect(run(card, 2).state).toBe('review');
    expect(run(card, 4).state).toBe('review');
  });

  it('follows 1, 6, then × EF', () => {
    expect(play(sm2, [3, 3, 3, 3]).intervals).toEqual([1, 6, 15, 38]);
  });

  it('caps at maxInterval', () => {
    expect(run({ ...genericCard('review'), interval: 100 }, 4, { maxInterval: 120 }).interval).toBe(
      120,
    );
  });

  it('uses a custom grade table', () => {
    // Hard counted as a failure (q = 2).
    expect(run(genericCard('review'), 2, { qualityAgain: 0, qualityHard: 2 })).toMatchObject({
      interval: 1,
      step: 0,
    });
  });
});

describe('sm2: params and adopt', () => {
  it('validates the grade table', () => {
    expect(sm2.validate({})).toEqual(sm2.defaults);
    expect(() => sm2.validate({ qualityGood: 2 })).toThrow(ParamValidationError);
    expect(() => sm2.validate({ qualityEasy: 6 })).toThrow(/qualityEasy/);
  });

  it('maps cards from other algorithms', () => {
    const ctx = ctxFor(sm2);
    expect(sm2.adopt(genericCard('new'), ctx).state).toBe('new');
    expect(sm2.adopt(genericCard('review'), ctx)).toMatchObject({
      state: 'review',
      interval: 10,
      step: 2,
      ease: 2.5,
      due: T0,
    });
    expect(sm2.adopt({ ...genericCard('review'), interval: 3, ease: 0 }, ctx)).toMatchObject({
      step: 1,
      ease: 2.5,
    });
    expect(sm2.adopt(genericCard('learning'), ctx)).toMatchObject({
      state: 'review',
      interval: 1,
      step: 0,
    });
  });
});
