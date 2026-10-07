import type { ImportDocument } from '../format/schema';
import { orderDocument } from './order';

/** JSON export: 2-space indent, stable key order, trailing newline. */
export function exportJson(doc: ImportDocument): string {
  return `${JSON.stringify(orderDocument(doc), null, 2)}\n`;
}
