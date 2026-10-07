import { stringify } from 'yaml';
import type { ImportDocument } from '../format/schema';
import { orderDocument } from './order';

/**
 * YAML 1.2 export: block style, stable key order, multi-line strings as `|` literal blocks and
 * never folded (`lineWidth: 0`), so LaTeX and code survive byte for byte.
 */
export function exportYaml(doc: ImportDocument): string {
  return stringify(orderDocument(doc), {
    version: '1.2',
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
    blockQuote: 'literal',
    defaultKeyType: 'PLAIN',
    aliasDuplicateObjects: false,
  });
}
