/**
 * Writes `schema/mnemo-import.schema.json` (JSON Schema 2020-12) from the Zod schema.
 * Run: `pnpm --filter @mnemo/importers schema`. A test checks the committed file is up to date.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importJsonSchemaText } from '../src/parse/json-schema';

const file = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../schema/mnemo-import.schema.json',
);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, importJsonSchemaText());
console.log(`Wrote ${file}`);
