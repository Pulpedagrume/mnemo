import { describe, expect, it } from 'vitest';
import { getScheduler, listSchedulers } from './registry';
import { simulateWorkload } from './simulate';
import type { SimulationResult } from './simulate';
import { genericCard } from './test/helpers';

const avg = (r: SimulationResult, from: number, to: number) => {
  const slice = r.days.slice(from, to);
  return slice.reduce((s, d) => s + d.reviews, 0) / slice.length;
};

describe.each(['fsrs', 'anki', 'sm2', 'leitner', 'ladder'])('simulation: %s', (id) => {
  const input = {
    scheduler: id,
    days: 365,
    newPerDay: 20,
    newCardsAvailable: 1_000,
    retention: 0.9,
    seed: 42,
  };
  const result = simulateWorkload(input);

  it('introduces all 1000 cards and keeps the workload bounded', () => {
    const totalNew = result.days.reduce((s, d) => s + d.newCards, 0);
    expect(totalNew).toBe(1_000);
    expect(result.days).toHaveLength(365);
    const maxReviews = Math.max(...result.days.map((d) => d.reviews));
    expect(maxReviews).toBeLessThan(800);
    // Second half: no explosion (the last quarter is not much heavier than the third one).
    expect(avg(result, 274, 365)).toBeLessThanOrEqual(avg(result, 183, 274) * 1.3 + 5);
    expect(result.avgReviewsPerDay).toBeGreaterThan(0);
    for (const d of result.days) {
      expect(d.minutes).toBeCloseTo((d.reviews * 8 + d.newCards * 20) / 60, 0);
      expect(d.lapses).toBeLessThanOrEqual(d.reviews);
    }
  });

  it('is deterministic for a seed', () => {
    expect(simulateWorkload(input)).toEqual(result);
    expect(simulateWorkload({ ...input, seed: 7 }).totalReviews).not.toBe(result.totalReviews);
  });
});

describe('simulation options', () => {
  it('accepts a scheduler object, start cards and review caps', () => {
    const fsrs = getScheduler('fsrs');
    const start = [genericCard('review'), genericCard('new'), genericCard('learning')];
    const r = simulateWorkload({
      scheduler: fsrs,
      days: 30,
      newPerDay: 5,
      newCardsAvailable: 0,
      reviewsPerDay: 1,
      retention: 1,
      seed: 1,
      secondsPerReview: 6,
      secondsPerNew: 30,
      startCards: start,
    });
    expect(r.days[0]?.newCards).toBe(1);
    expect(r.days.reduce((s, d) => s + d.newCards, 0)).toBe(1);
    expect(r.days.every((d) => d.lapses === 0)).toBe(true);
    expect(r.seed).toBe(1);
  });

  it('rejects invalid inputs', () => {
    const base = { scheduler: 'anki', days: 30, newPerDay: 10, retention: 0.9, seed: 1 };
    expect(() => simulateWorkload({ ...base, days: 0 })).toThrow(RangeError);
    expect(() => simulateWorkload({ ...base, newPerDay: -1 })).toThrow(RangeError);
    expect(() => simulateWorkload({ ...base, retention: 1.5 })).toThrow(RangeError);
    expect(() => simulateWorkload({ ...base, scheduler: 'nope' })).toThrow(/Unknown scheduler/);
  });

  it('lower retention means more lapses', () => {
    const base = { scheduler: 'fsrs', days: 60, newPerDay: 20, seed: 3 };
    const good = simulateWorkload({ ...base, retention: 0.95 });
    const bad = simulateWorkload({ ...base, retention: 0.6 });
    const lapses = (r: SimulationResult) => r.days.reduce((s, d) => s + d.lapses, 0);
    expect(lapses(bad)).toBeGreaterThan(lapses(good));
  });

  it('covers every registered scheduler', () => {
    expect(listSchedulers().length).toBeGreaterThanOrEqual(5);
  });
});
