export { FORMAT_ID } from '@mnemo/core';

/** File extensions the importer accepts, by detected format. `.apkg` arrives in phase 4. */
export const IMPORT_EXTENSIONS = {
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  markdown: ['.md', '.markdown', '.txt'],
  csv: ['.csv', '.tsv'],
  bundle: ['.zip'],
} as const;

export type ImportFormat = keyof typeof IMPORT_EXTENSIONS;
