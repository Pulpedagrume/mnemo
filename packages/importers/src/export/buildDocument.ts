import { FORMAT_ID } from '@mnemo/core';
import type { Media, Note, NoteType } from '@mnemo/core';
import type { z } from 'zod';
import type {
  ImportDeckSchema,
  ImportDocument,
  ImportMediaSchema,
  ImportMetaSchema,
  ImportNoteTypeDefSchema,
} from '../format/schema';
import { isCustomNoteType, noteToImportNote } from './noteToImportNote';

/** URL written in the `$schema` key of exported documents (change it here only). */
export const IMPORT_SCHEMA_URL = 'https://mnemo.example/schema/mnemo-import.schema.json';

/** Folder of media files inside a `.zip` bundle. */
export const BUNDLE_MEDIA_DIR = 'media';

export interface ExportNoteInput {
  note: Note;
  noteType: NoteType;
  /** Full deck path ("A::B"). */
  deckPath: string;
}

export interface BuildDocumentInput {
  notes: readonly ExportNoteInput[];
  decks?: readonly z.infer<typeof ImportDeckSchema>[];
  media?: readonly Media[];
  meta?: z.infer<typeof ImportMetaSchema>;
  /** Default deck; the most common deck path when omitted. */
  defaultDeck?: string;
}

const MEDIA_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Most common non-empty deck path (first one wins ties), or undefined. */
export function mostCommonDeck(paths: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const path of paths) if (path.trim() !== '') counts.set(path, (counts.get(path) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  // Map iteration follows first appearance, so the first deck wins ties.
  for (const [path, count] of counts)
    if (count > bestCount) {
      best = path;
      bestCount = count;
    }
  return best;
}

/** Safe file name: only [A-Za-z0-9._-], no leading dot, at most 100 characters. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-100);
  return cleaned === '' ? 'file' : cleaned;
}

/**
 * File name of each media inside the bundle (`media/<name>`), keyed by media id. Names are
 * sanitized and made unique by inserting `-2`, `-3`… before the extension.
 */
export function mediaFileNames(media: readonly Media[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const m of media) {
    const base = safeFileName(m.name);
    const dot = base.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}-${i}${ext}`;
    used.add(name.toLowerCase());
    out.set(m.id, name);
  }
  return out;
}

function mediaDeclarations(media: readonly Media[]): z.infer<typeof ImportMediaSchema>[] {
  const names = mediaFileNames(media);
  return media.map((m) => {
    const name = names.get(m.id) ?? safeFileName(m.name);
    const decl: z.infer<typeof ImportMediaSchema> = {
      id: MEDIA_ID.test(m.id) ? m.id : safeFileName(m.id).slice(0, 64),
      file: `${BUNDLE_MEDIA_DIR}/${name}`,
    };
    if (m.alt !== undefined && m.alt !== '') decl.alt = m.alt;
    return decl;
  });
}

function noteTypeDef(noteType: NoteType): z.infer<typeof ImportNoteTypeDefSchema> {
  const fields = noteType.fields.map((f) => f.name);
  const first = fields[0] ?? 'Front';
  const templates =
    noteType.templates.length > 0
      ? noteType.templates.map((t) => ({ name: t.name, front: t.front, back: t.back }))
      : [{ name: 'Card 1', front: `{{${first}}}`, back: '{{FrontSide}}' }];
  const def: z.infer<typeof ImportNoteTypeDefSchema> = {
    id: noteType.id,
    name: noteType.name,
    fields,
    templates,
  };
  if (noteType.css !== undefined && noteType.css !== '') def.css = noteType.css;
  return def;
}

/** Builds a canonical `mnemo/1` document (valid for `ImportDocumentSchema`) from domain notes. */
export function buildImportDocument(input: BuildDocumentInput): ImportDocument {
  const defaultDeck = input.defaultDeck ?? mostCommonDeck(input.notes.map((n) => n.deckPath));
  const notes = input.notes.map((n) =>
    noteToImportNote(n.note, n.noteType, {
      deckPath: n.deckPath,
      ...(defaultDeck === undefined ? {} : { defaultDeck }),
    }),
  );
  const customTypes = new Map<string, NoteType>();
  for (const n of input.notes)
    if (isCustomNoteType(n.noteType)) customTypes.set(n.noteType.id, n.noteType);

  const meta = input.meta && Object.keys(input.meta).length > 0 ? input.meta : undefined;
  return {
    $schema: IMPORT_SCHEMA_URL,
    format: FORMAT_ID,
    ...(meta ? { meta: { ...meta } } : {}),
    ...(defaultDeck === undefined ? {} : { defaults: { deck: defaultDeck } }),
    ...(input.decks && input.decks.length > 0 ? { decks: input.decks.map((d) => ({ ...d })) } : {}),
    ...(input.media && input.media.length > 0 ? { media: mediaDeclarations(input.media) } : {}),
    ...(customTypes.size > 0 ? { noteTypes: [...customTypes.values()].map(noteTypeDef) } : {}),
    notes,
  };
}
