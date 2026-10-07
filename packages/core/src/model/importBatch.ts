import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common';
import { NoteSchema } from './note';
import { CardSchema } from './card';

export const IMPORT_MODES = ['skip-duplicates', 'update', 'add', 'replace-deck'] as const;
export const ImportModeSchema = z.enum(IMPORT_MODES);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export const ImportBatchSchema = z.object({
  id: IdSchema,
  createdAt: TimestampSchema,
  fileName: z.string().max(500),
  format: z.string().max(50),
  mode: ImportModeSchema,
  counts: z.record(z.string(), z.number().int().nonnegative()),
  /** Serialized validation report (shape defined by @mnemo/importers). */
  report: z.unknown(),
  /** Notes created or updated by this import. */
  noteIds: z.array(IdSchema),
  /** Notes as they were before an update, to undo the import. */
  previousVersions: z.array(NoteSchema),
  /** Cards as they were before the import (updated notes, replaced decks), to undo it. */
  previousCards: z.array(CardSchema).optional(),
  undoneAt: TimestampSchema.optional(),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
