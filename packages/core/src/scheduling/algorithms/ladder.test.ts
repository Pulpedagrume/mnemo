import { describe, expect, it } from 'vitest';
import type { CardMemory, Rating } from '../../model/card';
import { ctxFor, dayAt, genericCard, min, T0 } from '../test/helpers';
import { ParamValidationError } from '../types';
import { ladderScheduler as ladder } from './ladder';

const run = (card: CardMemory, rating: Rating, params: object = {}) =>
  ladder.schedule(card, rating, ctxFor(ladder, { params })).card;

// Default rungs: 10m, 1d, 3d, 1w, 2w, 1mo, 3mo, 6mo.
describe('ladder', () => {
  it.each([
    [1, { state: 'learning', step: 0, due: T0 + min(10) }],
    [2, { state: 'learning', step: 0, due: T0 + min(10) }],
    [3, { state: 'learning', step: 0, due: T0 + min(10) }],
    [4, { state: 'review', step: 1, due: dayAt(1), interval: 1 }],
  ] as const)('new card, rating %i', (rating, expected) => {
    expect(run(ladder.initCard({ now: T0 }), rating)).toMatchObject(expected);
  });

  const onRung3: CardMemory = { ...genericCard('review'), step: 3, interval: 7 };
  it.each([
    [1, { state: 'relearning', step: 0, due: T0 + min(10), lapses: 2 }],
    [2, { state: 'review', step: 3, interval: 7, due: dayAt(7), lapses: 1 }],
    [3, { state: 'review', step: 4, interval: 14, due: dayAt(14) }],
    [4, { state: 'review', step: 5, interval: 30, due: dayAt(30) }],
  ] as const)('review card on rung 3, rating %i', (rating, expected) => {
    expect(run(onRung3, rating)).toMatchObject(expected);
  });

  it.each([
    ['learning', 3, { state: 'review', step: 2, interval: 3 }],
    ['learning', 1, { state: 'learning', step: 0, lapses: 0 }],
    ['relearning', 1, { state: 'relearning', step: 0 }],
    ['relearning', 2, { state: 'relearning', step: 0 }],
    ['relearning', 3, { state: 'review', step: 1 }],
    ['relearning', 4, { state: 'review', step: 2 }],
  ] as const)('%s card, rating %i', (state, rating, expected) => {
    expect(run(genericCard(state), rating)).toMatchObject(expected);
  });

  it('onAgain back1/back2 only go down', () => {
    expect(run(onRung3, 1, { onAgain: 'back1' })).toMatchObject({ step: 2, interval: 3 });
    expect(run(onRung3, 1, { onAgain: 'back2' })).toMatchObject({ step: 1, interval: 1 });
    expect(run({ ...onRung3, step: 1 }, 1, { onAgain: 'back2' }).step).toBe(0);
  });

  it('stays on the top rung', () => {
    expect(run({ ...onRung3, step: 7 }, 4)).toMatchObject({ step: 7, interval: 180 });
    expect(run({ ...onRung3, step: 99 }, 3)).toMatchObject({ step: 7 });
  });

  it('validates rungs', () => {
    expect(ladder.validate({}).rungs).toHaveLength(8);
    expect(() => ladder.validate({ rungs: ['1d', 'soon'] })).toThrow(ParamValidationError);
    expect(() => ladder.validate({ rungs: ['1d', '1h'] })).toThrow(/increasing/);
    expect(() => ladder.validate({ rungs: [] })).toThrow(ParamValidationError);
    expect(() => ladder.validate({ rungs: ['200y'] })).toThrow(/maximum/);
    expect(ladder.validate({ rungs: ['1h', '2j', '1sem'] }).rungs).toEqual(['1h', '2j', '1sem']);
  });

  it('adopts cards onto the closest rung', () => {
    const ctx = ctxFor(ladder);
    expect(ladder.adopt(genericCard('new'), ctx).state).toBe('new');
    expect(ladder.adopt(genericCard('review'), ctx)).toMatchObject({
      state: 'review',
      step: 3,
      interval: 7,
      due: T0,
    });
    expect(ladder.adopt(genericCard('learning'), ctx)).toMatchObject({
      state: 'learning',
      step: 0,
    });
    expect(ladder.adopt(genericCard('relearning'), ctx)).toMatchObject({ state: 'relearning' });
  });
});
