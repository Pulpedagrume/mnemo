import fc from 'fast-check';
import type { CardMemory, CardState, Rating } from '../../model/card';
import { seededRng } from '../../rng';
import { DAY_MS, MINUTE_MS, parseDuration, studyCalendar } from '../../time';
import { makeSchedulerContext } from '../registry';
import type { AnyScheduler, Scheduler, SchedulerContext } from '../types';

/** 2026-03-10 12:00 UTC (a Tuesday, outside DST transitions). */
export const T0 = Date.UTC(2026, 2, 10, 12, 0, 0);
export const UTC4 = studyCalendar('UTC', 4);

export function ctxFor<P>(
  scheduler: Scheduler<P>,
  opts: { now?: number; params?: unknown; seed?: number } = {},
): SchedulerContext<P> {
  return makeSchedulerContext({
    now: opts.now ?? T0,
    params: scheduler.validate(opts.params ?? {}),
    rng: seededRng(opts.seed ?? 1),
    calendar: UTC4,
  });
}

/** Start of the UTC+4h study day `n` days after T0's. */
export function dayAt(n: number): number {
  return Date.UTC(2026, 2, 10 + n, 4, 0, 0);
}

export const min = (n: number) => n * MINUTE_MS;

/** Hand-made memories in each state, as another algorithm could leave them. */
export function genericCard(state: CardState, now = T0): CardMemory {
  switch (state) {
    case 'new':
      return {
        state,
        due: now,
        interval: 0,
        ease: 0,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        step: 0,
        box: 0,
      };
    case 'learning':
      return {
        state,
        due: now,
        interval: 10 / 1440,
        ease: 2.5,
        stability: 0,
        difficulty: 0,
        reps: 1,
        lapses: 0,
        step: 1,
        box: 0,
        lastReview: now - min(10),
      };
    case 'review':
      return {
        state,
        due: now,
        interval: 10,
        ease: 2.5,
        stability: 10,
        difficulty: 5,
        reps: 5,
        lapses: 1,
        step: 2,
        box: 3,
        lastReview: now - 10 * DAY_MS,
      };
    case 'relearning':
      return {
        state,
        due: now,
        interval: 10 / 1440,
        ease: 2.3,
        stability: 2,
        difficulty: 6,
        reps: 6,
        lapses: 2,
        step: 0,
        box: 1,
        lastReview: now - min(10),
        schedulerData: { pendingInterval: 3 },
      };
  }
}

/** Upper bound on intervals for an algorithm's (validated) params. */
export function maxIntervalOf(id: string, params: unknown): number {
  const p = params as Record<string, unknown>;
  switch (id) {
    case 'anki':
    case 'sm2':
      return p.maxInterval as number;
    case 'fsrs':
      return p.maximumInterval as number;
    case 'leitner':
      return Math.max(...(p.boxIntervalsDays as number[]));
    case 'ladder':
      return Math.max(...(p.rungs as string[]).map((r) => (parseDuration(r) ?? 0) / DAY_MS)) + 1;
    default:
      return 36_500;
  }
}

export const ratingArb: fc.Arbitrary<Rating> = fc.constantFrom<Rating>(1, 2, 3, 4);

/** Any valid memory, including odd ones (fields left by other algorithms, zero ease...). */
export const memoryArb = (now: number): fc.Arbitrary<CardMemory> =>
  fc
    .record({
      state: fc.constantFrom<CardState>('new', 'learning', 'review', 'relearning'),
      dueOffset: fc.integer({ min: -400 * DAY_MS, max: 400 * DAY_MS }),
      interval: fc.oneof(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 40_000, noNaN: true }),
      ),
      ease: fc.oneof(fc.constant(0), fc.double({ min: 1.3, max: 5, noNaN: true })),
      stability: fc.oneof(fc.constant(0), fc.double({ min: 0.01, max: 36_500, noNaN: true })),
      difficulty: fc.oneof(fc.constant(0), fc.double({ min: 1, max: 10, noNaN: true })),
      reps: fc.nat(500),
      lapses: fc.nat(50),
      step: fc.nat(30),
      box: fc.nat(30),
      lastReviewAgo: fc.option(fc.integer({ min: 0, max: 3_000 * DAY_MS }), { nil: undefined }),
    })
    .map((r): CardMemory => {
      const m: CardMemory = {
        state: r.state,
        due: Math.max(0, now + r.dueOffset),
        interval: r.interval,
        ease: r.ease,
        stability: r.stability,
        difficulty: r.difficulty,
        reps: r.reps,
        lapses: r.lapses,
        step: r.step,
        box: r.box,
      };
      if (r.lastReviewAgo !== undefined) m.lastReview = now - r.lastReviewAgo;
      return m;
    });

/** Plays `ratings` from a fresh card, each review at the card's due time. */
export function play(
  scheduler: AnyScheduler,
  ratings: readonly Rating[],
  opts: { start?: number; params?: unknown; seed?: number } = {},
): { card: CardMemory; now: number; intervals: number[] } {
  let now = opts.start ?? T0;
  let card = scheduler.initCard({ now });
  const intervals: number[] = [];
  ratings.forEach((rating, i) => {
    if (card.state !== 'new') now = Math.max(now, card.due);
    const ctx = ctxFor(scheduler, { now, params: opts.params, seed: (opts.seed ?? 1) + i });
    card = scheduler.schedule(card, rating, ctx).card;
    intervals.push(card.interval);
  });
  return { card, now, intervals };
}
