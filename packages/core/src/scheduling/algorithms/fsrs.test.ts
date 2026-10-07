import { describe, expect, it } from 'vitest';
import type { CardMemory, Rating } from '../../model/card';
import { seededRng } from '../../rng';
import { DAY_MS, studyCalendar } from '../../time';
import { makeSchedulerContext } from '../registry';
import { ctxFor, dayAt, genericCard, min, T0 } from '../test/helpers';
import { ParamValidationError } from '../types';
import { FSRS_DEFAULT_WEIGHTS, fsrsScheduler as fsrs } from './fsrs';

const NO_FUZZ = { enableFuzz: false };
const run = (card: CardMemory, rating: Rating, params: object = NO_FUZZ, now = T0) =>
  fsrs.schedule(card, rating, ctxFor(fsrs, { params, now })).card;

/** Plays ratings, each at the card's due time, and records a compact trace. */
function trace(ratings: readonly Rating[], params: object = NO_FUZZ) {
  let now = T0;
  let card = fsrs.initCard({ now });
  return ratings.map((rating) => {
    if (card.state !== 'new') now = Math.max(now, card.due);
    card = run(card, rating, params, now);
    return {
      rating,
      state: card.state,
      dueInDays: Math.round(((card.due - T0) / DAY_MS) * 1000) / 1000,
      interval: Math.round(card.interval * 1000) / 1000,
      stability: Math.round(card.stability * 1000) / 1000,
      difficulty: Math.round(card.difficulty * 1000) / 1000,
    };
  });
}

describe('fsrs: every state × rating', () => {
  it.each([
    [1, 'learning', T0 + min(1)],
    [2, 'learning', T0 + min(6)],
    [3, 'learning', T0 + min(10)],
    [4, 'review', undefined],
  ] as const)('new card, rating %i', (rating, state, due) => {
    const c = run(fsrs.initCard({ now: T0 }), rating);
    expect(c.state).toBe(state);
    if (due !== undefined) expect(c.due).toBe(due);
    else expect(c.due).toBe(dayAt(c.interval));
    expect(c.stability).toBeGreaterThan(0);
    expect(c.difficulty).toBeGreaterThanOrEqual(1);
    expect(c.reps).toBe(1);
  });

  it.each([1, 2, 3, 4] as const)('learning card, rating %i', (rating) => {
    const c = run(genericCard('learning'), rating);
    expect(['learning', 'review']).toContain(c.state);
    expect(c.due).toBeGreaterThan(T0);
  });

  it.each([1, 2, 3, 4] as const)('review card, rating %i', (rating) => {
    const card = genericCard('review');
    const c = run(card, rating);
    if (rating === 1) {
      expect(c).toMatchObject({ state: 'relearning', due: T0 + min(10), lapses: 2 });
      expect(c.stability).toBeLessThan(card.stability);
    } else {
      expect(c.state).toBe('review');
      expect(c.due).toBe(dayAt(c.interval));
      expect(c.interval).toBeGreaterThanOrEqual(1);
    }
  });

  it('orders review intervals Hard ≤ Good ≤ Easy', () => {
    const p = fsrs.preview(genericCard('review'), ctxFor(fsrs, { params: NO_FUZZ }));
    expect(p[2].interval).toBeLessThanOrEqual(p[3].interval);
    expect(p[3].interval).toBeLessThanOrEqual(p[4].interval);
    expect(p[3].interval).toBeGreaterThan(10);
  });

  it.each([1, 2, 3, 4] as const)('relearning card, rating %i', (rating) => {
    const c = run(genericCard('relearning'), rating);
    expect(['relearning', 'review']).toContain(c.state);
    expect(c.due).toBeGreaterThan(T0);
  });

  it('estimates a memory state when stability is missing', () => {
    const c = run({ ...genericCard('review'), stability: 0, difficulty: 0 }, 3);
    expect(c.stability).toBeGreaterThan(10);
    expect(Number.isFinite(c.interval)).toBe(true);
  });

  it('respects maximumInterval', () => {
    const card = { ...genericCard('review'), stability: 5_000, interval: 5_000 };
    const c = run(card, 4, { ...NO_FUZZ, maximumInterval: 365 });
    expect(c.interval).toBe(365);
  });

  it('skips steps when short-term scheduling is off', () => {
    const c = run(fsrs.initCard({ now: T0 }), 3, { ...NO_FUZZ, enableShortTerm: false });
    expect(c.state).toBe('review');
    expect(c.interval).toBeGreaterThanOrEqual(1);
  });

  it('counts elapsed time in study days (time zone aware)', () => {
    // Reviewed late in the evening in Paris, then again the next morning: one study day elapsed.
    const cal = studyCalendar('Europe/Paris', 4);
    const card: CardMemory = {
      ...genericCard('review'),
      interval: 1,
      stability: 1,
      lastReview: Date.UTC(2026, 2, 9, 22, 30), // 23:30 in Paris
    };
    const ctx = makeSchedulerContext({
      now: Date.UTC(2026, 2, 10, 7, 0), // 08:00 in Paris
      params: fsrs.validate(NO_FUZZ),
      rng: seededRng(1),
      calendar: cal,
    });
    const c = fsrs.schedule(card, 3, ctx).card;
    expect(c.due).toBe(cal.startOf(cal.today(ctx.now) + c.interval));
  });
});

describe('fsrs: golden sequences', () => {
  it('Good ×5', () => {
    expect(trace([3, 3, 3, 3, 3])).toMatchInlineSnapshot(`
      [
        {
          "difficulty": 2.118,
          "dueInDays": 0.007,
          "interval": 0.007,
          "rating": 3,
          "stability": 2.307,
          "state": "learning",
        },
        {
          "difficulty": 2.111,
          "dueInDays": 1.667,
          "interval": 2,
          "rating": 3,
          "stability": 2.307,
          "state": "review",
        },
        {
          "difficulty": 2.104,
          "dueInDays": 12.667,
          "interval": 11,
          "rating": 3,
          "stability": 10.971,
          "state": "review",
        },
        {
          "difficulty": 2.097,
          "dueInDays": 58.667,
          "interval": 46,
          "rating": 3,
          "stability": 46.317,
          "state": "review",
        },
        {
          "difficulty": 2.091,
          "dueInDays": 221.667,
          "interval": 163,
          "rating": 3,
          "stability": 163,
          "state": "review",
        },
      ]
    `);
  });

  it('Again, Good, Good, Again, Good, Easy', () => {
    expect(trace([1, 3, 3, 1, 3, 4])).toMatchInlineSnapshot(`
      [
        {
          "difficulty": 6.413,
          "dueInDays": 0.001,
          "interval": 0.001,
          "rating": 1,
          "stability": 0.212,
          "state": "learning",
        },
        {
          "difficulty": 6.402,
          "dueInDays": 0.008,
          "interval": 0.007,
          "rating": 3,
          "stability": 0.247,
          "state": "learning",
        },
        {
          "difficulty": 6.391,
          "dueInDays": 0.667,
          "interval": 1,
          "rating": 3,
          "stability": 0.284,
          "state": "review",
        },
        {
          "difficulty": 8.799,
          "dueInDays": 0.674,
          "interval": 0.007,
          "rating": 1,
          "stability": 0.126,
          "state": "relearning",
        },
        {
          "difficulty": 8.785,
          "dueInDays": 1.667,
          "interval": 1,
          "rating": 3,
          "stability": 0.152,
          "state": "review",
        },
        {
          "difficulty": 8.365,
          "dueInDays": 4.667,
          "interval": 3,
          "rating": 4,
          "stability": 1.477,
          "state": "review",
        },
      ]
    `);
  });

  it('Easy, Hard, Good with fuzz', () => {
    expect(trace([4, 2, 3], {})).toMatchInlineSnapshot(`
      [
        {
          "difficulty": 1,
          "dueInDays": 6.667,
          "interval": 7,
          "rating": 4,
          "stability": 8.296,
          "state": "review",
        },
        {
          "difficulty": 4.011,
          "dueInDays": 31.667,
          "interval": 25,
          "rating": 2,
          "stability": 24.991,
          "state": "review",
        },
        {
          "difficulty": 4.002,
          "dueInDays": 109.667,
          "interval": 78,
          "rating": 3,
          "stability": 80.054,
          "state": "review",
        },
      ]
    `);
  });
});

describe('fsrs: determinism', () => {
  it('gives identical results (fuzz included) for identical inputs', () => {
    const card = { ...genericCard('review'), interval: 40, stability: 40 };
    const a = fsrs.schedule(card, 3, ctxFor(fsrs, { seed: 1 }));
    const b = fsrs.schedule(card, 3, ctxFor(fsrs, { seed: 999 }));
    expect(a).toEqual(b);
  });

  it('fuzz spreads cards reviewed at different times', () => {
    const card = { ...genericCard('review'), interval: 40, stability: 40 };
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      seen.add(fsrs.schedule(card, 3, ctxFor(fsrs, { now: T0 + i * 1_000 })).card.interval);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('fsrs: params and adopt', () => {
  it('validates params', () => {
    expect(fsrs.validate({})).toEqual(fsrs.defaults);
    expect(fsrs.defaults.w).toEqual(FSRS_DEFAULT_WEIGHTS);
    expect(() => fsrs.validate({ requestRetention: 0.5 })).toThrow(ParamValidationError);
    expect(() => fsrs.validate({ w: [1, 2, 3] })).toThrow(/17, 19 or 21/);
    expect(() => fsrs.validate({ learningSteps: ['1x'] })).toThrow(/learningSteps\.0/);
  });

  it('accepts custom steps in hours and days', () => {
    const c = run(fsrs.initCard({ now: T0 }), 3, { ...NO_FUZZ, learningSteps: ['1h', '1d'] });
    // ts-fsrs graduates a card whose next step is a day or longer.
    expect(c).toMatchObject({ due: dayAt(1), interval: 1 });
  });

  it('maps ease to difficulty and interval to stability', () => {
    const ctx = ctxFor(fsrs);
    expect(fsrs.adopt(genericCard('new'), ctx).state).toBe('new');
    const review = fsrs.adopt({ ...genericCard('review'), stability: 0, difficulty: 0 }, ctx);
    expect(review).toMatchObject({ state: 'review', stability: 10, difficulty: 5, due: T0 });
    const hard = fsrs.adopt({ ...genericCard('review'), ease: 1.3 }, ctx);
    expect(hard.difficulty).toBe(10);
    const learning = fsrs.adopt(genericCard('learning'), ctx);
    expect(learning).toMatchObject({ state: 'learning', step: 1 });
    expect(learning.stability).toBeGreaterThan(0);
    const relearning = fsrs.adopt(genericCard('relearning'), ctx);
    expect(relearning).toMatchObject({ state: 'relearning', step: 0 });
    expect(relearning.schedulerData).toBeUndefined();
  });
});
