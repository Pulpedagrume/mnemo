import type { ImportFormat } from '../api';
import type { IssueSink } from './issue';
import { parseJsonText } from './json/parse';
import type { FormatOutput } from './types';
import { parseYamlText } from './yaml';
import { parseMarkdownText } from './markdown/parse';
import { parseCsvText } from './csv';

/** Runs the parser of a format on cleaned text. */
export function parseFormat(format: ImportFormat, text: string, sink: IssueSink): FormatOutput {
  switch (format) {
    case 'json':
      return parseJsonText(text, sink);
    case 'yaml':
      return parseYamlText(text, sink);
    case 'markdown':
      return parseMarkdownText(text, sink);
    case 'csv':
      return parseCsvText(text, sink);
  }
}
