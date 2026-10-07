import { z } from 'zod';

/** Entity identifier: a UUIDv7 for entities we create; tolerant length for imported ids. */
export const IdSchema = z.string().min(1).max(64);
export type Id = z.infer<typeof IdSchema>;

/** Milliseconds since the Unix epoch, UTC. */
export const TimestampSchema = z.number().int().nonnegative();
export type Timestamp = z.infer<typeof TimestampSchema>;

export const I18nStringSchema = z.object({ fr: z.string(), en: z.string() });

/** Fields carried by every synchronisable entity (soft delete via tombstones). */
export const syncFields = {
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: TimestampSchema.optional(),
};

/** Stable user/AI-provided identifier used for idempotent re-imports. */
export const UidSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);

/** Deck path separator, as in "Réseaux::Ethernet". */
export const DECK_SEPARATOR = '::';
