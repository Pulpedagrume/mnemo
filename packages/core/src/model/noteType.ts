import { z } from 'zod';
import { IdSchema, syncFields } from './common';

export const RENDERERS = [
  'basic',
  'cloze',
  'typed',
  'mcq',
  'truefalse',
  'matching',
  'ordering',
  'list',
  'template',
] as const;
export const RendererSchema = z.enum(RENDERERS);
export type Renderer = z.infer<typeof RendererSchema>;

export const NoteFieldSchema = z.object({
  name: z.string().min(1).max(100),
  required: z.boolean().optional(),
});
export type NoteField = z.infer<typeof NoteFieldSchema>;

export const CardTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  front: z.string(),
  back: z.string(),
});
export type CardTemplate = z.infer<typeof CardTemplateSchema>;

export const NoteTypeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  builtin: z.boolean(),
  renderer: RendererSchema,
  fields: z.array(NoteFieldSchema).min(1),
  /** For `template` (and basic/reversed): one card per template. Cloze: one per cloze number. */
  templates: z.array(CardTemplateSchema),
  css: z.string().max(50_000).optional(),
  ...syncFields,
});
export type NoteType = z.infer<typeof NoteTypeSchema>;
