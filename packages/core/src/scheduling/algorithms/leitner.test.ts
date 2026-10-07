import { describe, expect, it } from 'vitest';
import type { CardMemory, Rating } from '../../model/card';
import { ctxFor, dayAt, genericCard, T0 } from '../test/helpers';
import { ParamValidationError } from '../types';
import { leitnerScheduler as leitner } from './leitner';

const run = (card: CardMemory, rating: Rating, params: object = {}) =>
  leitner.schedule(card, rating, ctxFor(leitner, { params })).card;

describe('leitner', () => {
  it.each([
    [1, 1, 1],
    [2, 1, 1],
    [3, 2, 2],
    [4, 3, 4],
  ] as const)('new card, rating %i → box %i (%i d)', (rating, box, days) => {
    const c = run(leitner.initCard({ now: T0 }), rating);
    expect(c).toMatchObject({ state: 'review', box, interval: days, due: dayAt(days), lapses: 0 });
  });

  // genericCard(...).box: learning 0, review 3, relearning 1.
  it.each([
    ['review', 1, 1, 1],
    ['review', 2, 3, 4],
    ['review', 3, 4, 8],
    ['review', 4, 5, 16],
    ['learning', 1, 1, 1],
    ['learning', 3, 2, 2],
    ['relearning', 2, 1, 1],
    ['relearning', 4, 3, 4],
  ] as const)('%s card, rating %i → box %i', (state, rating, box, days) => {
    expect(run(genericCard(state), rating)).toMatchObject({ state: 'review', box, interval: days });
  });

  it('counts a lapse when a seen card is forgotten', () => {
    expect(run(genericCard('review'), 1).lapses).toBe(2);
  });

  it('onAgain back1 only moves down one box', () => {
    expect(run(genericCard('review'), 1, { onAgain: 'back1' }).box).toBe(2);
    expect(run({ ...genericCard('review'), box: 1 }, 1, { onAgain: 'back1' }).box).toBe(1);
  });

  it('caps at the last box', () => {
    expect(run({ ...genericCard('review'), box: 5 }, 4)).toMatchObject({ box: 5, interval: 16 });
  });

  it('requires one interval per box', () => {
    expect(() => leitner.validate({ boxes: 3 })).toThrow(ParamValidationError);
    expect(() => leitner.validate({ boxes: 3 })).toThrow(/expected 3 intervals/);
    expect(leitner.validate({ boxes: 3, boxIntervalsDays: [1, 3, 9] }).boxes).toBe(3);
  });

  it('adopts cards into the box with the closest interval', () => {
    const ctx = ctxFor(leitner);
    expect(leitner.adopt(genericCard('new'), ctx).state).toBe('new');
    expect(leitner.adopt(genericCard('review'), ctx)).toMatchObject({
      box: 4,
      interval: 8,
      due: T0,
    });
    const far = { ...genericCard('review'), due: dayAt(90), interval: 90 };
    expect(leitner.adopt(far, ctx)).toMatchObject({ box: 5, due: dayAt(16) });
    expect(leitner.adopt(genericCard('learning'), ctx)).toMatchObject({ box: 1, state: 'review' });
  });
});
