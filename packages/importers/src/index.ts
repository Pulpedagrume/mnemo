export { FORMAT_ID } from '@mnemo/core';
export * from './format/schema';
export * from './format/aliases';
export * from './format/specs';
export * from './report';
export * from './api';

/** File extensions the importer accepts, by detected format. `.apkg` arrives in phase 4. */
export const IMPORT_EXTENSIONS = {
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  markdown: ['.md', '.markdown', '.txt'],
  csv: ['.csv', '.tsv'],
  bundle: ['.zip'],
} as const;
