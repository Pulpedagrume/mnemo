import { describe, expect, it } from 'vitest';
import type { CardMemory } from '../../model/card';
import { DAY_MS } from '../../time';
import { ctxFor, dayAt, genericCard, min, play, T0 } from '../test/helpers';
import { ParamValidationError } from '../types';
import { ankiScheduler as anki } from './anki';

const NO_FUZZ = { fuzz: false };
const ctx = (params: object = NO_FUZZ, now = T0) => ctxFor(anki, { params, now });
const run = (card: CardMemory, rating: 1 | 2 | 3 | 4, params: object = NO_FUZZ) =>
  anki.schedule(card, rating, ctx(params)).card;

describe('anki: new cards', () => {
  const card = anki.initCard({ now: T0 });

  it('Again restarts the first step', () => {
    const c = run(card, 1);
    expect(c).toMatchObject({ state: 'learning', step: 0, due: T0 + min(1), ease: 2.5, reps: 1 });
    expect(c.interval).toBeCloseTo(1 / 1440);
    expect(c.lastReview).toBe(T0);
  });

  it('Hard waits halfway between the first two steps', () => {
    expect(run(card, 2)).toMatchObject({ state: 'learning', step: 0, due: T0 + min(5.5) });
  });

  it('Good moves to the next step', () => {
    expect(run(card, 3)).toMatchObject({ state: 'learning', step: 1, due: T0 + min(10) });
  });

  it('Easy graduates with the easy interval', () => {
    expect(run(card, 4)).toMatchObject({ state: 'review', interval: 4, due: dayAt(4), step: 0 });
  });

  it('with no learning steps, any answer graduates', () => {
    const p = { ...NO_FUZZ, learningSteps: [] };
    expect(run(card, 1, p)).toMatchObject({ state: 'review', interval: 1, due: dayAt(1) });
    expect(run(card, 4, p)).toMatchObject({ state: 'review', interval: 4 });
  });

  it('with a single step, Hard waits 1.5 × the step', () => {
    expect(run(card, 2, { ...NO_FUZZ, learningSteps: [10] })).toMatchObject({
      due: T0 + min(15),
    });
  });

  it('day-long steps land at the start of a study day', () => {
    const c = run(card, 3, { ...NO_FUZZ, learningSteps: [10, 1440 * 2] });
    expect(c).toMatchObject({ state: 'learning', step: 1, due: dayAt(2), interval: 2 });
  });
});

describe('anki: learning cards', () => {
  const card: CardMemory = { ...genericCard('learning'), step: 1 };

  it.each([
    [1, { state: 'learning', step: 0, due: T0 + min(1) }],
    [2, { state: 'learning', step: 1, due: T0 + min(10) }],
    [3, { state: 'review', interval: 1, due: dayAt(1) }],
    [4, { state: 'review', interval: 4, due: dayAt(4) }],
  ] as const)('rating %i', (rating, expected) => {
    expect(run(card, rating)).toMatchObject(expected);
  });

  it('clamps a step index beyond the configured steps', () => {
    expect(run({ ...card, step: 9 }, 3)).toMatchObject({ state: 'review', interval: 1 });
  });
});

describe('anki: review cards', () => {
  const card = genericCard('review'); // interval 10, ease 2.5

  it('Again lapses into relearning and remembers the post-lapse interval', () => {
    const c = run(card, 1);
    expect(c).toMatchObject({
      state: 'relearning',
      step: 0,
      due: T0 + min(10),
      lapses: 2,
      schedulerData: { pendingInterval: 1 },
    });
    expect(c.ease).toBeCloseTo(2.3);
  });

  it('Again keeps a share of the interval with lapseNewIntervalPct', () => {
    const c = run(card, 1, { ...NO_FUZZ, lapseNewIntervalPct: 50 });
    expect(c.schedulerData).toEqual({ pendingInterval: 5 });
  });

  it('Again without relearning steps goes straight back to review', () => {
    const c = run(card, 1, { ...NO_FUZZ, relearningSteps: [], minLapseInterval: 2 });
    expect(c).toMatchObject({ state: 'review', interval: 2, due: dayAt(2), lapses: 2 });
  });

  it('Hard multiplies by hardInterval and lowers ease', () => {
    const c = run(card, 2);
    expect(c).toMatchObject({ state: 'review', interval: 12, due: dayAt(12) });
    expect(c.ease).toBeCloseTo(2.35);
  });

  it('Good multiplies by ease × intervalModifier', () => {
    expect(run(card, 3)).toMatchObject({ interval: 25, ease: 2.5, due: dayAt(25) });
    expect(run(card, 3, { ...NO_FUZZ, intervalModifier: 0.8 })).toMatchObject({ interval: 20 });
  });

  it('Easy applies the easy bonus and raises ease', () => {
    const c = run(card, 4);
    expect(c.interval).toBe(33);
    expect(c.ease).toBeCloseTo(2.65);
  });

  it('never exceeds maxInterval', () => {
    const c = run({ ...card, interval: 30 }, 4, { ...NO_FUZZ, maxInterval: 40 });
    expect(c.interval).toBe(40);
  });

  it('Good is always at least one day more than the current interval', () => {
    const c = run({ ...card, interval: 1, ease: 1.3 }, 3);
    expect(c.interval).toBeGreaterThanOrEqual(2);
  });

  it('uses the starting ease when the card has none', () => {
    expect(run({ ...card, ease: 0 }, 3).ease).toBe(2.5);
  });

  it('never lets ease drop below minEase', () => {
    expect(run({ ...card, ease: 1.35 }, 1).ease).toBe(1.3);
  });
});

describe('anki: relearning cards', () => {
  const card = genericCard('relearning'); // pendingInterval 3

  it.each([
    [1, { state: 'relearning', step: 0, due: T0 + min(10) }],
    [2, { state: 'relearning', step: 0, due: T0 + min(15) }],
    [3, { state: 'review', interval: 3, due: dayAt(3) }],
    [4, { state: 'review', interval: 4, due: dayAt(4) }],
  ] as const)('rating %i', (rating, expected) => {
    const c = run(card, rating);
    expect(c).toMatchObject(expected);
    expect(c.lapses).toBe(2);
  });

  it('falls back to minLapseInterval without stored data', () => {
    const c = run({ ...card, schedulerData: undefined }, 3);
    expect(c.interval).toBe(1);
  });

  it('graduates immediately when relearning steps were removed', () => {
    expect(run(card, 1, { ...NO_FUZZ, relearningSteps: [] })).toMatchObject({ state: 'review' });
  });
});

describe('anki: fuzz', () => {
  it('stays within ±5 % and is driven by ctx.rng', () => {
    const card = { ...genericCard('review'), interval: 100 };
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const c = anki.schedule(card, 3, ctxFor(anki, { seed })).card;
      seen.add(c.interval);
      expect(c.interval).toBeGreaterThanOrEqual(237);
      expect(c.interval).toBeLessThanOrEqual(263);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('does not fuzz short intervals', () => {
    const card = anki.initCard({ now: T0 });
    for (let seed = 1; seed <= 20; seed++) {
      expect(anki.schedule(card, 3, ctxFor(anki, { seed })).card.due).toBe(T0 + min(10));
    }
  });
});

describe('anki: params', () => {
  it('fills defaults', () => {
    expect(anki.validate({})).toEqual(anki.defaults);
    expect(anki.defaults).toMatchObject({ learningSteps: [1, 10], startingEase: 2.5, fuzz: true });
  });

  it('reports readable errors', () => {
    expect(() => anki.validate({ startingEase: 'x', easyInterval: 0 })).toThrow(
      ParamValidationError,
    );
    const error = (() => {
      try {
        anki.validate({ graduatingInterval: 5, easyInterval: 2 });
      } catch (e) {
        return e as ParamValidationError;
      }
      return undefined;
    })();
    expect(error?.issues).toHaveLength(1);
    expect(error?.issues[0]?.path).toBe('easyInterval');
    expect(error?.message).toMatch(/easyInterval: .*graduatingInterval/);
    expect(() => anki.validate({ startingEase: 1.3, minEase: 2 })).toThrow(/startingEase/);
  });
});

describe('anki: adopt', () => {
  const c = ctx();
  it('keeps new cards new', () => {
    expect(anki.adopt(genericCard('new'), c).state).toBe('new');
  });
  it('maps review cards, keeping the due date and deriving ease', () => {
    const src = {
      ...genericCard('review'),
      ease: 0,
      difficulty: 5,
      interval: 9.6,
      due: T0 + DAY_MS,
    };
    expect(anki.adopt(src, c)).toMatchObject({
      state: 'review',
      interval: 10,
      due: T0 + DAY_MS,
      ease: 2.5,
      stability: 0,
      box: 0,
    });
  });
  it('maps learning and relearning cards to the closest step', () => {
    expect(anki.adopt(genericCard('learning'), c)).toMatchObject({ state: 'learning', step: 1 });
    expect(anki.adopt(genericCard('relearning'), c)).toMatchObject({
      state: 'relearning',
      step: 0,
      schedulerData: { pendingInterval: 1 },
    });
  });
  it('turns learning cards into review cards when there are no steps', () => {
    const c2 = ctx({ learningSteps: [] });
    expect(anki.adopt(genericCard('learning'), c2)).toMatchObject({ state: 'review', interval: 1 });
  });
});

describe('anki: full sequence', () => {
  it('grows intervals with successive Good answers', () => {
    const { intervals } = play(anki, [3, 3, 3, 3, 3], { params: NO_FUZZ });
    expect(intervals.map((i) => Math.round(i * 1440) / 1440)).toEqual([10 / 1440, 1, 3, 8, 20]);
  });
});
