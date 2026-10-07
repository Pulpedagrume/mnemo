import type { ImportFormat } from '../api';
import type { ImportDocument } from '../format/schema';
import { buildImportDocument } from './buildDocument';
import type { BuildDocumentInput } from './buildDocument';
import { exportCsv } from './csv';
import { exportJson } from './json';
import { exportMarkdown } from './markdown';
import { exportYaml } from './yaml';

export interface ExportResult {
  text: string;
  /** What could not be represented exactly in the chosen format (English). */
  warnings: string[];
}

/** File extension of each export format. */
export const EXPORT_EXTENSIONS: Readonly<Record<ImportFormat, string>> = {
  json: '.json',
  yaml: '.yaml',
  markdown: '.md',
  csv: '.csv',
};

/** Serializes a canonical document to one of the import formats. */
export function exportDocument(doc: ImportDocument, format: ImportFormat): ExportResult {
  switch (format) {
    case 'json':
      return { text: exportJson(doc), warnings: [] };
    case 'yaml':
      return { text: exportYaml(doc), warnings: [] };
    case 'markdown':
      return exportMarkdown(doc);
    case 'csv':
      return exportCsv(doc);
  }
}

/** `buildImportDocument` then `exportDocument`. */
export function exportNotes(input: BuildDocumentInput, format: ImportFormat): ExportResult {
  return exportDocument(buildImportDocument(input), format);
}
