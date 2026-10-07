import type { Command } from 'commander';
import { buildImportJsonSchema, importJsonSchemaText } from '@mnemo/importers';
import type { Io } from '../io';

/** The import format as JSON Schema 2020-12 (same generator as schema/mnemo-import.schema.json). */
export function importJsonSchema(): Record<string, unknown> {
  return buildImportJsonSchema();
}

export function registerSchema(program: Command, io: Io): void {
  program
    .command('schema')
    .description('Print the JSON Schema of the import format')
    .action(() => {
      io.out(importJsonSchemaText());
    });
}
