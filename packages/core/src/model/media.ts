import { z } from 'zod';
import { IdSchema, syncFields } from './common';

/** Media metadata. Content is stored by the repository (Blob in browsers, file on servers). */
export const MediaSchema = z.object({
  id: IdSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string().min(3).max(100),
  size: z.number().int().nonnegative(),
  name: z.string().min(1).max(255),
  alt: z.string().max(1_000).optional(),
  ...syncFields,
});
export type Media = z.infer<typeof MediaSchema>;
