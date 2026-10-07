import { describe, expect, it } from 'vitest';
import { CardMemorySchema } from '../model/card';
import { DAY_MS } from '../time';
import { convertCards, forecastDue } from './convert';
import { getScheduler } from './registry';
import { ctxFor, dayAt, genericCard, T0, UTC4 } from './test/helpers';
import { dayOffsetOf, difficultyFromEase, easeFromDifficulty, elapsedStudyDays } from './util';

describe('convertCards', () => {
  const cards = [
    genericCard('new'),
    genericCard('learning'),
    genericCard('review'),
    { ...genericCard('review'), interval: 200, due: dayAt(150) },
    genericCard('relearning'),
  ];

  it('converts every card into a valid memory of the target algorithm', () => {
    const anki = getScheduler('anki');
    const leitner = getScheduler('leitner');
    const out = convertCards(cards, anki, leitner, ctxFor(leitner));
    expect(out).toHaveLength(cards.length);
    out.forEach((c) => {
      expect(() => CardMemorySchema.parse(c)).not.toThrow();
    });
    expect(out.map((c) => c.state)).toEqual(['new', 'review', 'review', 'review', 'review']);
    expect(out[3]).toMatchObject({ box: 5, due: dayAt(16) });
  });

  it('leaves cards untouched when the algorithm does not change', () => {
    const fsrs = getScheduler('fsrs');
    const out = convertCards(cards, fsrs, fsrs, ctxFor(fsrs));
    expect(out).toEqual(cards);
    expect(out[0]).not.toBe(cards[0]);
  });

  it('feeds the before/after forecast', () => {
    const anki = getScheduler('anki');
    const ladder = getScheduler('ladder');
    const before = forecastDue(cards, UTC4, T0);
    expect(before).toEqual({ today: 3, tomorrow: 3, next7Days: 3 });
    const after = forecastDue(convertCards(cards, anki, ladder, ctxFor(ladder)), UTC4, T0);
    expect(after.next7Days).toBeGreaterThanOrEqual(after.tomorrow);
    expect(after.tomorrow).toBeGreaterThanOrEqual(after.today);
  });

  it('counts cumulative windows', () => {
    const due = (d: number) => ({ ...genericCard('review'), due: dayAt(d) });
    expect(forecastDue([due(0), due(1), due(3), due(6), due(7)], UTC4, T0)).toEqual({
      today: 1,
      tomorrow: 2,
      next7Days: 4,
    });
  });
});

describe('mapping helpers', () => {
  it('maps ease and difficulty both ways', () => {
    expect(difficultyFromEase(2.5)).toBe(5);
    expect(difficultyFromEase(1.3)).toBe(10);
    expect(difficultyFromEase(4)).toBe(1);
    expect(difficultyFromEase(0)).toBe(5);
    expect(easeFromDifficulty(5)).toBe(2.5);
    expect(easeFromDifficulty(10)).toBeCloseTo(1.3);
    expect(easeFromDifficulty(0)).toBe(2.5);
    for (const e of [1.5, 2, 2.5, 3])
      expect(easeFromDifficulty(difficultyFromEase(e))).toBeCloseTo(e);
  });

  it('computes study-day offsets', () => {
    const ctx = ctxFor(getScheduler('anki'));
    expect(dayOffsetOf(T0, ctx)).toBe(0);
    expect(dayOffsetOf(dayAt(0) - 1, ctx)).toBe(-1);
    expect(dayOffsetOf(dayAt(3), ctx)).toBe(3);
    expect(elapsedStudyDays(T0 - 10 * DAY_MS, ctx)).toBe(10);
    expect(elapsedStudyDays(undefined, ctx)).toBe(0);
    expect(elapsedStudyDays(T0 + 5 * DAY_MS, ctx)).toBe(0);
  });
});
