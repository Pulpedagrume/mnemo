import { z } from 'zod';
import { IdSchema, syncFields } from './common';

export const NEW_ORDERS = ['added', 'random', 'deck'] as const;
export const MIX_MODES = ['after', 'before', 'mixed'] as const;
export const HINT_POLICIES = ['none', 'capGood', 'forceHard'] as const;
export type HintPolicy = (typeof HINT_POLICIES)[number];

export const LimitsSchema = z.object({
  newPerDay: z.number().int().min(0).max(9_999).default(20),
  reviewsPerDay: z.number().int().min(0).max(99_999).default(200),
  newOrder: z.enum(NEW_ORDERS).default('added'),
  /** Where new cards go relative to reviews. */
  mix: z.enum(MIX_MODES).default('after'),
  /** Learning cards due within this window are shown now. */
  learnAheadMinutes: z.number().int().min(0).max(1_440).default(20),
});
export type Limits = z.infer<typeof LimitsSchema>;

export const BehaviorSchema = z.object({
  /** Do not show two new cards of the same note on the same day. */
  buryNewSiblings: z.boolean().default(true),
  buryReviewSiblings: z.boolean().default(true),
  buttons: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  /** none: hints don't affect the grade; capGood: max Good; forceHard: any hint means Hard. */
  hintPolicy: z.enum(HINT_POLICIES).default('capGood'),
  /** Lapses after which a card becomes a leech (0 disables). */
  leechThreshold: z.number().int().min(0).max(99).default(8),
  leechAction: z.enum(['tag', 'suspend']).default('tag'),
  /** Answer time is capped at this value in statistics. */
  maxAnswerSeconds: z.number().int().min(10).max(3_600).default(60),
});
export type Behavior = z.infer<typeof BehaviorSchema>;

export const PresetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  /** Scheduler id from the registry (fsrs, sm2, anki, leitner, ladder, or a registered one). */
  algorithm: z.string().min(1).max(50),
  /** Algorithm parameters, validated by the scheduler. */
  params: z.record(z.string(), z.unknown()),
  limits: LimitsSchema,
  behavior: BehaviorSchema,
  builtin: z.boolean().optional(),
  ...syncFields,
});
export type Preset = z.infer<typeof PresetSchema>;

export const DEFAULT_LIMITS: Limits = LimitsSchema.parse({});
export const DEFAULT_BEHAVIOR: Behavior = BehaviorSchema.parse({});
