import { describe, expect, it } from 'vitest';
import type { Card, ReviewLog } from '../model';
import { blankMemory } from '../model';
import { DAY_MS, studyCalendar } from '../time';
import {
  activityByDay,
  buttonBreakdown,
  dueForecast,
  hintUsage,
  intervalHistogram,
  retention,
  stateBreakdown,
  streak,
  summarizeSession,
  toCsv,
} from './index';

const cal = studyCalendar('UTC', 0);
const NOW = 100 * DAY_MS + 3_600_000;

function log(over: Partial<ReviewLog>): ReviewLog {
  return {
    id: 'l',
    cardId: 'c',
    ts: NOW,
    rating: 3,
    durationMs: 1_000,
    stateBefore: 'review',
    stateAfter: 'review',
    intervalBefore: 5,
    intervalAfter: 10,
    dueBefore: 0,
    dueAfter: 0,
    algorithm: 'fsrs',
    presetId: 'p',
    paramsHash: 'x',
    cram: false,
    hintUsed: 0,
    ...over,
  };
}

function card(over: Partial<Card>): Card {
  return {
    ...blankMemory(0),
    id: 'c',
    noteId: 'n',
    ord: 0,
    deckId: 'd',
    suspended: false,
    flag: 0,
    leech: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('stats', () => {
  it('aggregates activity per study day', () => {
    const map = activityByDay([log({}), log({ ts: NOW + 1 }), log({ ts: NOW - DAY_MS })], cal);
    expect(map.get(100)).toEqual({ reviews: 2, durationMs: 2_000 });
    expect(map.get(99)?.reviews).toBe(1);
  });

  it('forecasts due cards, counting overdue as today', () => {
    const cards = [
      card({ state: 'review', due: NOW - 5 * DAY_MS }),
      card({ state: 'review', due: NOW + DAY_MS }),
      card({ state: 'review', due: NOW + 40 * DAY_MS }),
      card({ state: 'new' }),
      card({ state: 'review', due: NOW, suspended: true }),
    ];
    const f = dueForecast(cards, NOW, cal, 30);
    expect(f).toHaveLength(30);
    expect(f[0]).toBe(1);
    expect(f[1]).toBe(1);
    expect(f.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('breaks down states', () => {
    const b = stateBreakdown([
      card({ state: 'new' }),
      card({ state: 'review', interval: 30, leech: true }),
      card({ state: 'review', suspended: true }),
      card({ state: 'learning', deletedAt: 1 }),
    ]);
    expect(b).toMatchObject({ new: 1, review: 1, suspended: 1, leech: 1, mature: 1, learning: 0 });
  });

  it('computes retention and button distribution', () => {
    const logs = [
      log({ rating: 1 }),
      log({ rating: 3 }),
      log({ rating: 4, intervalBefore: 30 }),
      log({ rating: 3, stateBefore: 'new' }),
      log({ rating: 3, cram: true }),
    ];
    expect(retention(logs, 0, NOW + 1)).toEqual({ total: 3, passed: 2, rate: 2 / 3 });
    expect(retention([], 0, 1).rate).toBeNull();
    const buttons = buttonBreakdown(logs);
    expect(buttons.young).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
    expect(buttons.mature[4]).toBe(1);
    expect(buttons.learning[3]).toBe(1);
  });

  it('builds an interval histogram', () => {
    const h = intervalHistogram(
      [card({ state: 'review', interval: 2 }), card({ state: 'review', interval: 999 })],
      [1, 3],
    );
    expect(h).toEqual([
      { upTo: 1, count: 0 },
      { upTo: 3, count: 1 },
      { upTo: null, count: 1 },
    ]);
  });

  it('counts streaks', () => {
    expect(streak(new Set([8, 9, 10]), 10)).toBe(3);
    expect(streak(new Set([8, 9]), 10)).toBe(2);
    expect(streak(new Set([7]), 10)).toBe(0);
  });

  it('reports hint usage and session summary', () => {
    const logs = [log({ hintUsed: 2, rating: 1 }), log({ hintUsed: 0, rating: 3 })];
    expect(hintUsage(logs)).toEqual({
      reviews: 2,
      withHint: 1,
      hintsOpened: 2,
      passRateWithHint: 0,
      passRateWithoutHint: 1,
    });
    expect(summarizeSession(logs)).toEqual({
      reviewed: 2,
      passed: 1,
      successRate: 0.5,
      durationMs: 2_000,
      hintsUsed: 2,
    });
    expect(summarizeSession([]).successRate).toBeNull();
  });

  it('escapes CSV cells', () => {
    expect(
      toCsv([
        ['a', 1, null],
        ['x,y', 'say "hi"', 2],
      ]),
    ).toBe('a,1,\n"x,y","say ""hi""",2\n');
  });
});
