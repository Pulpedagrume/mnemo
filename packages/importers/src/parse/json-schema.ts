import { z } from 'zod';
import { ImportDocumentSchema } from '../format/schema';

/** Placeholder id of the published schema; the final GitHub Pages URL is set at publication. */
export const IMPORT_SCHEMA_ID = 'https://mnemo.example/schema/mnemo-import.schema.json';

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * JSON Schema (draft 2020-12) of the canonical `mnemo/1` document, generated from the Zod
 * schema. Zod refinements are not representable: the "exactly one of file, url or data" rule
 * of media entries is added by hand as a `oneOf`.
 */
export function buildImportJsonSchema(): JsonObject {
  const generated = z.toJSONSchema(ImportDocumentSchema, {
    target: 'draft-2020-12',
    io: 'input',
  }) as JsonObject;
  const properties = generated.properties;
  const media = isObject(properties) ? properties.media : undefined;
  if (isObject(media) && isObject(media.items)) {
    media.items.oneOf = [{ required: ['file'] }, { required: ['url'] }, { required: ['data'] }];
  }
  const { $schema, ...rest } = generated;
  return {
    $schema,
    $id: IMPORT_SCHEMA_ID,
    title: 'Mnemo import document (mnemo/1)',
    description:
      'Canonical flashcard import format of Mnemo (JSON or YAML). Markdown and CSV imports are converted to this shape. Generated from the Zod schema in packages/importers/src/format/schema.ts — do not edit by hand.',
    ...rest,
  };
}

/** The schema as committed in `schema/mnemo-import.schema.json`. */
export function importJsonSchemaText(): string {
  return `${JSON.stringify(buildImportJsonSchema(), null, 2)}\n`;
}
