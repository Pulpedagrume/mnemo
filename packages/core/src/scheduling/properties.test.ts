import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CardMemorySchema, RATINGS } from '../model/card';
import type { CardMemory } from '../model/card';
import { BUILTIN_SCHEDULERS } from './registry';
import { ctxFor, maxIntervalOf, memoryArb, play, ratingArb, T0 } from './test/helpers';

const NUM_RUNS = 150;
const nowArb = fc.integer({ min: T0 - 400 * 86_400_000, max: T0 + 400 * 86_400_000 });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe.each(BUILTIN_SCHEDULERS.map((s) => [s.id, s] as const))('%s properties', (_id, s) => {
  it('produces valid, bounded memories for any input', () => {
    fc.assert(
      fc.property(
        nowArb.chain((now) => fc.tuple(fc.constant(now), memoryArb(now), ratingArb, fc.nat())),
        ([now, card, rating, seed]) => {
          const ctx = ctxFor(s, { now, seed });
          const { card: out, log } = s.schedule(card, rating, ctx);
          expect(() => CardMemorySchema.parse(out)).not.toThrow();
          expect(Number.isFinite(out.interval)).toBe(true);
          expect(out.interval).toBeGreaterThanOrEqual(0);
          expect(out.interval).toBeLessThanOrEqual(maxIntervalOf(s.id, ctx.params));
          expect(out.state).not.toBe('new');
          expect(out.due).toBeGreaterThanOrEqual(now);
          expect(out.reps).toBe(card.reps + 1);
          expect(out.lastReview).toBe(now);
          expect(log).toMatchObject({ stateBefore: card.state, dueAfter: out.due });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('is pure: same input and seed, same output, input untouched', () => {
    fc.assert(
      fc.property(memoryArb(T0), ratingArb, fc.nat(), (card, rating, seed) => {
        const frozen = deepFreeze(JSON.parse(JSON.stringify(card)) as CardMemory);
        const a = s.schedule(frozen, rating, ctxFor(s, { seed }));
        const b = s.schedule(frozen, rating, ctxFor(s, { seed }));
        expect(a).toEqual(b);
        expect(frozen).toEqual(card);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('preview matches schedule for every rating', () => {
    fc.assert(
      fc.property(memoryArb(T0), fc.nat(), (card, seed) => {
        const preview = s.preview(card, ctxFor(s, { seed }));
        for (const r of RATINGS) {
          const { card: out } = s.schedule(card, r, ctxFor(s, { seed }));
          expect(preview[r]).toEqual({ due: out.due, interval: out.interval });
        }
      }),
      { numRuns: 60 },
    );
  });

  it('Good after Good never shortens the interval', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }), fc.nat(), (count, seed) => {
        const { intervals } = play(s, Array<3>(count).fill(3), { seed });
        for (let i = 1; i < intervals.length; i++) {
          expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1] ?? 0);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('validate(defaults) round-trips', () => {
    expect(s.validate(s.defaults)).toEqual(s.defaults);
    expect(s.validate(JSON.parse(JSON.stringify(s.defaults)) as unknown)).toEqual(s.defaults);
    expect(s.validate(undefined)).toEqual(s.defaults);
    expect(s.paramSpec.map((f) => f.key).sort()).toEqual(Object.keys(s.defaults as object).sort());
    for (const field of s.paramSpec) {
      expect(field.label.fr && field.label.en && field.help.fr && field.help.en).toBeTruthy();
    }
  });

  it('initCard gives a valid new card', () => {
    expect(CardMemorySchema.parse(s.initCard({ now: T0 })).state).toBe('new');
  });

  describe.each(BUILTIN_SCHEDULERS.map((f) => [f.id, f] as const))('adopt from %s', (_f, from) => {
    it('yields a valid memory that can be scheduled', () => {
      fc.assert(
        fc.property(fc.array(ratingArb, { maxLength: 8 }), fc.nat(), (ratings, seed) => {
          const { card, now } = play(from, ratings, { seed });
          const ctx = ctxFor(s, { now, seed });
          const adopted: CardMemory = s.adopt(card, ctx);
          expect(() => CardMemorySchema.parse(adopted)).not.toThrow();
          if (card.state === 'new') expect(adopted.state).toBe('new');
          expect(adopted.reps).toBe(card.reps);
          expect(adopted.lapses).toBe(card.lapses);
          expect(adopted.interval).toBeLessThanOrEqual(maxIntervalOf(s.id, ctx.params));
          const next = s.schedule(adopted, 3, ctx).card;
          expect(() => CardMemorySchema.parse(next)).not.toThrow();
        }),
        { numRuns: 25 },
      );
    });
  });
});
