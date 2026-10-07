import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blankMemory } from '../model/card';
import { seededRng } from '../rng';
import { studyCalendar } from '../time';
import {
  createSchedulerRegistry,
  defaultSchedulerRegistry,
  getScheduler,
  listSchedulers,
  makeSchedulerContext,
  previewLabels,
  registerScheduler,
} from './registry';
import { ctxFor, genericCard, maxIntervalOf, memoryArb, ratingArb, T0 } from './test/helpers';
import type { Scheduler } from './types';
import { rngForReview } from './util';

const constantScheduler: Scheduler<{ days: number }> = {
  id: 'constant-test',
  label: { fr: 'Constant', en: 'Constant' },
  description: { fr: 'Toujours le même délai.', en: 'Always the same delay.' },
  paramSpec: [],
  defaults: { days: 2 },
  validate: () => ({ days: 2 }),
  initCard: ({ now }) => blankMemory(now),
  schedule: (card, _r, ctx) => {
    const after = { ...card, state: 'review' as const, due: ctx.startOfDay(ctx.params.days) };
    return {
      card: after,
      log: {
        stateBefore: card.state,
        stateAfter: 'review',
        intervalBefore: card.interval,
        intervalAfter: 2,
        dueBefore: card.due,
        dueAfter: after.due,
      },
    };
  },
  preview: (_c, ctx) => {
    const p = { due: ctx.startOfDay(2), interval: 2 };
    return { 1: p, 2: p, 3: p, 4: p };
  },
  adopt: (card) => card,
};

describe('registry', () => {
  it('lists the five built-ins, FSRS first', () => {
    expect(listSchedulers().map((s) => s.id)).toEqual(['fsrs', 'anki', 'sm2', 'leitner', 'ladder']);
  });

  it('gets schedulers by id and throws a clear error otherwise', () => {
    expect(getScheduler('sm2').id).toBe('sm2');
    expect(() => getScheduler('nope')).toThrow(/Unknown scheduler "nope" \(known: fsrs, anki/);
  });

  it('registers new algorithms', () => {
    const registry = createSchedulerRegistry();
    registry.register(constantScheduler);
    expect(registry.get('constant-test')).toBe(constantScheduler);
    expect(registry.list()).toHaveLength(1);
    expect(() => {
      registry.register({ ...constantScheduler, id: 'Bad Id' });
    }).toThrow(/Invalid scheduler id/);

    registerScheduler(constantScheduler);
    expect(getScheduler('constant-test')).toBe(constantScheduler);
    expect(defaultSchedulerRegistry.list()).toHaveLength(6);
  });

  it('builds DST-aware contexts from a study calendar', () => {
    const cal = studyCalendar('Europe/Paris', 4);
    const now = Date.UTC(2026, 2, 28, 12); // the day before the switch to summer time
    const ctx = makeSchedulerContext({ now, params: {}, rng: seededRng(1), calendar: cal });
    expect(ctx.dayStart).toBe(Date.UTC(2026, 2, 28, 3)); // 04:00 CET
    expect(ctx.startOfDay(1)).toBe(Date.UTC(2026, 2, 29, 2)); // 04:00 CEST
    expect(ctx.startOfDay(1.4)).toBe(ctx.startOfDay(1));
  });

  it('formats preview labels', () => {
    const anki = getScheduler('anki');
    const ctx = ctxFor(anki);
    expect(previewLabels(anki, anki.initCard({ now: T0 }), ctx, 'fr')).toEqual({
      1: '1 min',
      2: '6 min',
      3: '10 min',
      4: '4 j',
    });
    expect(previewLabels(anki, genericCard('review'), ctxFor(anki), 'en')[3]).toMatch(/^2\d d$/);
  });

  it('rngForReview gives matching preview and schedule outcomes', () => {
    const anki = getScheduler('anki');
    const card = { ...genericCard('review'), interval: 100 };
    const ctxA = { ...ctxFor(anki), rng: rngForReview('card-1', 5) };
    const ctxB = { ...ctxFor(anki), rng: rngForReview('card-1', 5) };
    expect(anki.preview(card, ctxA)[3].due).toBe(anki.schedule(card, 3, ctxB).card.due);
  });
});

describe('custom params stay bounded', () => {
  it.each(['anki', 'sm2', 'fsrs'])('%s with a small maximum interval', (id) => {
    const s = getScheduler(id);
    fc.assert(
      fc.property(
        memoryArb(T0),
        ratingArb,
        fc.integer({ min: 1, max: 60 }),
        fc.nat(),
        (card, rating, max, seed) => {
          const params = id === 'fsrs' ? { maximumInterval: max } : { maxInterval: max };
          const ctx = ctxFor(s, { params, seed });
          const out = s.schedule(card, rating, ctx).card;
          expect(out.interval).toBeLessThanOrEqual(maxIntervalOf(id, ctx.params));
          expect(out.due).toBeLessThanOrEqual(ctx.startOfDay(max));
        },
      ),
      { numRuns: 100 },
    );
  });
});
