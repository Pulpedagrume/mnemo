import { z } from 'zod';
import { blankMemory } from '../model/card';
import type { CardMemory } from '../model/card';
import { seededRng } from '../rng';
import type { Rng } from '../rng';
import { DAY_MS, parseDuration } from '../time';
import { fnv1a } from '../util/hash';
import { ParamValidationError } from './types';
import type { ScheduleResult, SchedulerContext } from './types';

/** Parses `params` with a Zod schema, filling defaults; throws a readable ParamValidationError. */
export function parseParams<T>(schemaId: string, schema: z.ZodType<T>, params: unknown): T {
  const result = schema.safeParse(params ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  throw new ParamValidationError(`Invalid parameters for "${schemaId}": ${summary}`, issues);
}

/** Zod schema for a list of durations such as ["10m", "1d"] (see parseDuration). */
export function durationsSchema(minItems: number, maxItems: number, maxDays = 36_500) {
  return z
    .array(z.string())
    .min(minItems)
    .max(maxItems)
    .superRefine((items, ctx) => {
      items.forEach((item, index) => {
        const ms = parseDuration(item);
        if (ms === undefined || ms <= 0) {
          ctx.addIssue({
            code: 'custom',
            path: [index],
            message: `"${item}" is not a valid duration (examples: 10m, 1h, 1d, 2w, 3mo)`,
          });
        } else if (ms > maxDays * DAY_MS) {
          ctx.addIssue({
            code: 'custom',
            path: [index],
            message: `"${item}" is longer than the maximum of ${maxDays} days`,
          });
        }
      });
    });
}

/** Durations in ms; assumes the list was validated by durationsSchema. */
export function durationsMs(items: readonly string[]): number[] {
  return items.map((item) => parseDuration(item) ?? 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Finite, non-negative number or the fallback. */
export function safeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Index of the value closest to `target` (first one on ties). */
export function closestIndex(values: readonly number[], target: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  values.forEach((v, i) => {
    const d = Math.abs(v - target);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * Offset in study days of instant `ms` relative to today (0 = today, -1 = yesterday...),
 * using only the context's DST-aware day boundaries.
 */
export function dayOffsetOf(
  ms: number,
  ctx: Pick<SchedulerContext<unknown>, 'dayStart' | 'startOfDay'>,
): number {
  let k = Math.floor((ms - ctx.dayStart) / DAY_MS);
  // DST days are 23 or 25 hours long: nudge the estimate until ms is inside day k.
  for (let i = 0; i < 4 && ctx.startOfDay(k) > ms; i++) k--;
  for (let i = 0; i < 4 && ctx.startOfDay(k + 1) <= ms; i++) k++;
  return k;
}

/** Whole study days elapsed since `lastReview` (0 when unknown or in the future). */
export function elapsedStudyDays(
  lastReview: number | undefined,
  ctx: Pick<SchedulerContext<unknown>, 'dayStart' | 'startOfDay'>,
): number {
  if (lastReview === undefined) return 0;
  return Math.max(0, -dayOffsetOf(lastReview, ctx));
}

/**
 * Due date and interval (days) for a delay in ms: sub-day delays are exact (now + ms),
 * delays of a day or more land at the start of a study day.
 */
export function dueAfter(
  delayMs: number,
  ctx: Pick<SchedulerContext<unknown>, 'now' | 'startOfDay'>,
): { due: number; interval: number; dayBased: boolean } {
  if (delayMs < DAY_MS) {
    const ms = Math.max(0, Math.round(delayMs));
    return { due: ctx.now + ms, interval: ms / DAY_MS, dayBased: false };
  }
  const days = Math.max(1, Math.round(delayMs / DAY_MS));
  return { due: ctx.startOfDay(days), interval: days, dayBased: true };
}

/** Due date for a whole-day interval. */
export function dueInDays(
  days: number,
  ctx: Pick<SchedulerContext<unknown>, 'startOfDay'>,
): number {
  return ctx.startOfDay(Math.max(1, Math.round(days)));
}

/** Wraps a new memory with the ReviewLog patch describing the change. */
export function toResult(before: CardMemory, after: CardMemory): ScheduleResult {
  return {
    card: after,
    log: {
      stateBefore: before.state,
      stateAfter: after.state,
      intervalBefore: before.interval,
      intervalAfter: after.interval,
      dueBefore: before.due,
      dueAfter: after.due,
    },
  };
}

/**
 * Neutral memory carrying only the generic fields shared by every algorithm. Algorithm-specific
 * fields (ease, stability, difficulty, step, box, schedulerData) are reset; adopt() fills them.
 */
export function genericMemory(card: CardMemory): CardMemory {
  const m: CardMemory = {
    ...blankMemory(card.due),
    state: card.state,
    interval: safeNumber(card.interval, 0),
    reps: card.reps,
    lapses: card.lapses,
  };
  if (card.lastReview !== undefined) m.lastReview = card.lastReview;
  return m;
}

/**
 * Rng to pass to both `preview` and `schedule` of the same review so that the labels shown on
 * the buttons match the actual outcome (fuzz included).
 */
export function rngForReview(cardId: string, reps: number): Rng {
  return seededRng(Number.parseInt(fnv1a(`${cardId}:${reps}`), 16));
}

/**
 * Ease (SM-2 family, 1.3–~3.5) to FSRS difficulty (1–10): ease 2.5 maps to 5, every 0.24 of ease
 * below/above moves difficulty by one point. Used when switching algorithms.
 */
export function difficultyFromEase(ease: number): number {
  if (!(ease > 0)) return 5;
  return clamp(5 + ((2.5 - ease) * 5) / 1.2, 1, 10);
}

/** Inverse of difficultyFromEase, floored at 1.3. */
export function easeFromDifficulty(difficulty: number): number {
  if (!(difficulty > 0)) return 2.5;
  return clamp(2.5 - ((clamp(difficulty, 1, 10) - 5) * 1.2) / 5, 1.3, 3.46);
}

/** Ease of a card coming from another algorithm: its own ease, else derived, else the default. */
export function adoptedEase(card: CardMemory, startingEase: number, minEase: number): number {
  if (card.ease > 0) return Math.max(minEase, card.ease);
  if (card.difficulty > 0) return Math.max(minEase, easeFromDifficulty(card.difficulty));
  return startingEase;
}

/** Copy of a memory without algorithm-specific extras. */
export function withoutSchedulerData(card: CardMemory): CardMemory {
  const copy = { ...card };
  delete copy.schedulerData;
  return copy;
}
