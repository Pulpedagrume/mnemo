import { z } from 'zod';
import { IdSchema, TimestampSchema, syncFields } from './common';

export const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export const CardStateSchema = z.enum(CARD_STATES);
export type CardState = z.infer<typeof CardStateSchema>;

/** 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Rating = z.infer<typeof RatingSchema>;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

/**
 * Scheduling memory of a card: the part a scheduler reads and writes.
 * Fields unused by an algorithm keep neutral values; algorithm-specific extras go in schedulerData.
 */
export const CardMemorySchema = z.object({
  state: CardStateSchema,
  /** Epoch ms when the card is next due. Ignored for new cards (see Card.newPosition). */
  due: TimestampSchema,
  /** Current interval in days (fractional for sub-day learning steps). */
  interval: z.number().nonnegative(),
  /** Ease factor (SM-2 family), e.g. 2.5. */
  ease: z.number().nonnegative(),
  /** FSRS stability in days. */
  stability: z.number().nonnegative(),
  /** FSRS difficulty (1-10). */
  difficulty: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** Index in learning/relearning steps, or ladder rung. */
  step: z.number().int().nonnegative(),
  /** Leitner box (0 = not boxed yet). */
  box: z.number().int().nonnegative(),
  lastReview: TimestampSchema.optional(),
  schedulerData: z.record(z.string(), z.unknown()).optional(),
});
export type CardMemory = z.infer<typeof CardMemorySchema>;

export const CardSchema = CardMemorySchema.extend({
  id: IdSchema,
  noteId: IdSchema,
  /** Template index, or cloze number - 1. */
  ord: z.number().int().nonnegative(),
  deckId: IdSchema,
  /** Order among new cards (lower first). */
  newPosition: z.number().int().nonnegative().optional(),
  suspended: z.boolean(),
  buriedUntil: TimestampSchema.optional(),
  flag: z.number().int().min(0).max(7),
  leech: z.boolean(),
  ...syncFields,
});
export type Card = z.infer<typeof CardSchema>;

/** Memory of a never-studied card. Schedulers may override via initCard. */
export function blankMemory(now: number): CardMemory {
  return {
    state: 'new',
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
}

/** Extracts the scheduling memory from a card. */
export function cardMemory(card: Card): CardMemory {
  const m: CardMemory = {
    state: card.state,
    due: card.due,
    interval: card.interval,
    ease: card.ease,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    step: card.step,
    box: card.box,
  };
  if (card.lastReview !== undefined) m.lastReview = card.lastReview;
  if (card.schedulerData !== undefined) m.schedulerData = card.schedulerData;
  return m;
}
