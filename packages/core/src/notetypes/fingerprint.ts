import { getField, primaryFieldKey } from './builtins';
import { stripCloze } from './cloze';
import type { NoteContent, NoteTypeLike } from './types';

/**
 * Main text of a note (front/text/question/statement, first field for templates). A matching note
 * without a question falls back to its pairs so that distinct notes do not look identical.
 */
export function primaryText(note: NoteContent, noteType: NoteTypeLike): string {
  const text = getField(note.fields, primaryFieldKey(noteType));
  if (text.trim() === '' && note.data?.kind === 'matching') {
    return note.data.pairs.map((p) => `${p.left} = ${p.right}`).join('\n');
  }
  return text;
}

const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  // Code fence lines (```lang / ~~~).
  [/^[ \t]*(?:```|~~~).*$/gm, ''],
  // Images -> alt text, links -> text, autolinks -> URL.
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/<((?:https?|mailto):[^>\s]+)>/g, '$1'],
  // Headings, blockquotes, list markers at line start.
  [/^[ \t]*#{1,6}[ \t]+/gm, ''],
  [/^[ \t]*(?:>[ \t]?)+/gm, ''],
  [/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/gm, ''],
  // Emphasis, strikethrough and inline code markers.
  [/\*+/g, ''],
  [/~~/g, ''],
  [/`+/g, ''],
  [/(^|[^\p{L}\p{N}_])_+(?=\S)/gu, '$1'],
  [/(\S)_+(?=$|[^\p{L}\p{N}_])/gu, '$1'],
];

/**
 * Canonical form of a text for duplicate detection: cloze syntax replaced by answers, Markdown
 * syntax stripped, lowercased, NFC, whitespace collapsed.
 */
export function normalizeForFingerprint(text: string): string {
  let s = stripCloze(text.normalize('NFC'));
  for (const [re, by] of REPLACEMENTS) s = s.replace(re, by);
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Input of a note fingerprint: `${noteTypeId}\u0000${normalized primary text}`. The caller hashes
 * it (SHA-256 via WebCrypto or node:crypto).
 */
export function noteFingerprintInput(note: NoteContent, noteType: NoteTypeLike): string {
  return `${noteType.id}\u0000${normalizeForFingerprint(primaryText(note, noteType))}`;
}
