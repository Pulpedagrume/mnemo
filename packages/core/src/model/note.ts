import { z } from 'zod';
import { IdSchema, UidSchema, syncFields } from './common';

export const SourceSchema = z.object({
  doc: z.string().max(500).optional(),
  page: z.union([z.string().max(50), z.number().int()]).optional(),
  section: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const McqChoiceSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  explanation: z.string().optional(),
});
export type McqChoice = z.infer<typeof McqChoiceSchema>;

/**
 * Structured payload of interactive note types. Free text (question, statement, front, back, extra…)
 * stays in Note.fields so it is searchable and rendered as Markdown; this holds the rest.
 */
export const NoteDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('typed'),
    answers: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean(),
    ignoreAccents: z.boolean(),
  }),
  z.object({
    kind: z.literal('mcq'),
    choices: z.array(McqChoiceSchema).min(2).max(8),
    shuffle: z.boolean(),
  }),
  z.object({ kind: z.literal('truefalse'), answer: z.boolean() }),
  z.object({
    kind: z.literal('matching'),
    pairs: z
      .array(z.object({ left: z.string().min(1), right: z.string().min(1) }))
      .min(2)
      .max(12),
    distractors: z.array(z.string().min(1)),
  }),
  z.object({ kind: z.literal('ordering'), steps: z.array(z.string().min(1)).min(2).max(12) }),
  z.object({
    kind: z.literal('list'),
    items: z.array(z.string().min(1)).min(1),
    ordered: z.boolean(),
  }),
]);
export type NoteData = z.infer<typeof NoteDataSchema>;
export type NoteDataKind = NoteData['kind'];

export const NoteSchema = z.object({
  id: IdSchema,
  /** Stable identifier from the user or the AI, used for idempotent re-imports. */
  uid: UidSchema.optional(),
  noteTypeId: IdSchema,
  /** Field name -> Markdown. */
  fields: z.record(z.string(), z.string()),
  data: NoteDataSchema.optional(),
  tags: z.array(z.string().min(1).max(100)),
  deckId: IdSchema,
  /** Hints, from the most subtle to the most explicit. Never contain the answer. */
  hints: z.array(z.string().min(1)),
  explanation: z.string().optional(),
  source: SourceSchema.optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  needsReview: z.boolean().optional(),
  importBatchId: IdSchema.optional(),
  ...syncFields,
});
export type Note = z.infer<typeof NoteSchema>;
