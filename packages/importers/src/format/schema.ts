import { z } from 'zod';
import { FORMAT_ID } from '@mnemo/core';

/**
 * Canonical import document `mnemo/1` (JSON and YAML; Markdown and CSV are converted to it).
 * These schemas validate documents AFTER tolerant cleanup and alias resolution. Each note is
 * validated on its own (see ImportDocumentShellSchema) so one bad note never blocks the others.
 */

export const IMPORT_NOTE_TYPES = [
  'basic',
  'basic_reversed',
  'typed',
  'cloze',
  'mcq',
  'truefalse',
  'matching',
  'ordering',
  'list',
] as const;
export type ImportNoteType = (typeof IMPORT_NOTE_TYPES)[number];

export const UID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

const text = z.string().trim().min(1);
const textOrTexts = z.union([text, z.array(text).min(1)]);
const tagList = z.union([z.array(z.string().trim().min(1)), z.string()]);

export const ImportSourceSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      doc: z.string().optional(),
      page: z.union([z.string(), z.number().int()]).optional(),
      section: z.string().optional(),
      url: z.string().optional(),
    })
    .strict(),
]);

/** Keys shared by every note type. */
export const commonNoteShape = {
  uid: z
    .string()
    .regex(UID_PATTERN)
    .optional()
    .describe('Stable unique id: <prefix>-<chapter>-<nnn>'),
  deck: z.string().trim().min(1).optional().describe('Deck path, e.g. "Networks::Ethernet"'),
  tags: tagList.optional().describe('List, or a string separated by spaces or commas'),
  hint: textOrTexts.optional().describe('Hint(s), from the most subtle to the most explicit'),
  explanation: text.optional().describe('Shown with the answer'),
  source: ImportSourceSchema.optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  needsReview: z.boolean().optional().describe('Uncertain content to double-check'),
  extra: text.optional().describe('Free text shown after the answer'),
  media: z.array(z.string().min(1)).optional().describe('Ids of declared media'),
};

const note = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...commonNoteShape, ...shape }).strict();

export const McqChoiceInputSchema = z.union([
  text,
  z
    .object({
      text,
      correct: z.boolean().optional(),
      explanation: text.optional(),
    })
    .strict(),
]);

export const BasicNoteSchema = note('basic', { front: text, back: text });
export const BasicReversedNoteSchema = note('basic_reversed', { front: text, back: text });
export const TypedNoteSchema = note('typed', {
  front: text,
  answer: textOrTexts.describe('Accepted answer, or list of accepted variants'),
  caseSensitive: z.boolean().optional(),
  ignoreAccents: z.boolean().optional(),
});
export const ClozeNoteSchema = note('cloze', {
  text: text.describe('Text with {{c1::answer}} or {{c1::answer::hint}}'),
});
export const McqNoteSchema = note('mcq', {
  question: text,
  choices: z.array(McqChoiceInputSchema).min(2).max(8),
  /** Compact variant: choices as strings + correct answers as letters ("A") or 1-based numbers. */
  answers: z.array(z.union([z.string().trim().min(1), z.number().int().min(1)])).optional(),
  shuffle: z.boolean().optional(),
});
export const TrueFalseNoteSchema = note('truefalse', { statement: text, answer: z.boolean() });
export const MatchingNoteSchema = note('matching', {
  question: text.optional(),
  pairs: z
    .array(z.object({ left: text, right: text }).strict())
    .min(2)
    .max(12),
  distractors: z.array(text).optional(),
});
export const OrderingNoteSchema = note('ordering', {
  question: text,
  steps: z.array(text).min(2).max(12).describe('Steps in the CORRECT order'),
});
export const ListNoteSchema = note('list', {
  question: text,
  items: z.array(text).min(1),
  ordered: z.boolean().optional(),
});
export const CustomNoteSchema = z
  .object({
    type: z.string().regex(/^custom:[A-Za-z0-9._-]{1,64}$/),
    ...commonNoteShape,
    fields: z.record(z.string().min(1), z.string()),
  })
  .strict();

export const BUILTIN_NOTE_SCHEMAS = {
  basic: BasicNoteSchema,
  basic_reversed: BasicReversedNoteSchema,
  typed: TypedNoteSchema,
  cloze: ClozeNoteSchema,
  mcq: McqNoteSchema,
  truefalse: TrueFalseNoteSchema,
  matching: MatchingNoteSchema,
  ordering: OrderingNoteSchema,
  list: ListNoteSchema,
} as const satisfies Record<ImportNoteType, z.ZodType>;

export const ImportNoteSchema = z.union([
  z.discriminatedUnion('type', [
    BasicNoteSchema,
    BasicReversedNoteSchema,
    TypedNoteSchema,
    ClozeNoteSchema,
    McqNoteSchema,
    TrueFalseNoteSchema,
    MatchingNoteSchema,
    OrderingNoteSchema,
    ListNoteSchema,
  ]),
  CustomNoteSchema,
]);
export type ImportNote = z.infer<typeof ImportNoteSchema>;

export const ImportMetaSchema = z
  .object({
    title: z.string().optional(),
    language: z.string().optional().describe('BCP-47 language tag, e.g. "fr"'),
    source: z.string().optional(),
    generator: z.string().optional(),
  })
  .strict();

export const ImportDefaultsSchema = z
  .object({
    deck: z.string().trim().min(1).optional(),
    tags: tagList.optional(),
    type: z.string().trim().min(1).optional(),
  })
  .strict();

export const ImportDeckSchema = z
  .object({
    path: z.string().trim().min(1),
    description: z.string().optional(),
    preset: z.string().trim().min(1).optional().describe('Name of an existing preset'),
  })
  .strict();

export const ImportMediaSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    file: z.string().min(1).optional().describe('Path inside a .zip bundle, e.g. media/fig.png'),
    url: z.url().optional(),
    data: z
      .string()
      .regex(/^data:[\w/+.-]+;base64,/)
      .optional(),
    alt: z.string().optional(),
  })
  .strict()
  .refine((m) => [m.file, m.url, m.data].filter(Boolean).length === 1, {
    message: 'Exactly one of file, url or data is required',
  });

export const ImportNoteTypeDefSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    name: z.string().trim().min(1),
    fields: z.array(z.string().trim().min(1)).min(1),
    templates: z
      .array(
        z.object({ name: z.string().trim().min(1), front: z.string(), back: z.string() }).strict(),
      )
      .min(1),
    css: z.string().optional(),
  })
  .strict();

const documentShape = {
  $schema: z.string().optional(),
  format: z.literal(FORMAT_ID),
  meta: ImportMetaSchema.optional(),
  defaults: ImportDefaultsSchema.optional(),
  decks: z.array(ImportDeckSchema).optional(),
  media: z.array(ImportMediaSchema).optional(),
  noteTypes: z.array(ImportNoteTypeDefSchema).optional(),
  continuation: z.string().nullable().optional().describe('What remains to be generated, if any'),
};

/** Document with notes left unvalidated: notes are checked one by one. */
export const ImportDocumentShellSchema = z
  .object({ ...documentShape, notes: z.array(z.unknown()).min(1) })
  .strict();

/** Fully typed document (used for the published JSON Schema and for exports). */
export const ImportDocumentSchema = z
  .object({ ...documentShape, notes: z.array(ImportNoteSchema).min(1) })
  .strict();
export type ImportDocument = z.infer<typeof ImportDocumentSchema>;
