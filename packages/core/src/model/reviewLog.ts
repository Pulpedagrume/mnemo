import { z } from 'zod';
import { CardStateSchema, RatingSchema } from './card';
import { IdSchema, TimestampSchema } from './common';

/** Append-only record of one review. Never modified (undo deletes it). */
export const ReviewLogSchema = z.object({
  id: IdSchema,
  cardId: IdSchema,
  ts: TimestampSchema,
  rating: RatingSchema,
  durationMs: z.number().int().nonnegative(),
  stateBefore: CardStateSchema,
  stateAfter: CardStateSchema,
  intervalBefore: z.number().nonnegative(),
  intervalAfter: z.number().nonnegative(),
  dueBefore: TimestampSchema,
  dueAfter: TimestampSchema,
  algorithm: z.string(),
  presetId: IdSchema,
  paramsHash: z.string(),
  /** Cram reviews did not change the schedule. */
  cram: z.boolean(),
  /** Number of hints opened before answering. */
  hintUsed: z.number().int().nonnegative(),
  /** Typed or chosen answer, if any. */
  answer: z.string().max(5_000).optional(),
});
export type ReviewLog = z.infer<typeof ReviewLogSchema>;
