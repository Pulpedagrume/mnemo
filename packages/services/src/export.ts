import type { Deck, Id, Media, Note, NoteType } from '@mnemo/core';
import { APP_SLUG, indexDecks } from '@mnemo/core';
import { buildImportDocument, exportDocument, mediaFileNames, writeBundle } from '@mnemo/importers';
import type { ServiceContext } from './context';
import { resolveNoteType } from './notes';

export type ExportFormat = 'json' | 'yaml' | 'markdown' | 'csv' | 'zip';

export interface ExportResult {
  fileName: string;
  mime: string;
  content: string | Uint8Array;
  /** Information lost by the chosen format (e.g. MCQ per-choice explanations in CSV). */
  warnings: string[];
  notes: number;
}

const EXT: Record<Exclude<ExportFormat, 'zip'>, { ext: string; mime: string }> = {
  json: { ext: 'json', mime: 'application/json' },
  yaml: { ext: 'yaml', mime: 'application/yaml' },
  markdown: { ext: 'md', mime: 'text/markdown' },
  csv: { ext: 'csv', mime: 'text/csv' },
};

const MEDIA_REF = /media:([A-Za-z0-9._-]{1,64})/g;

function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'deck'
  );
}

/** Media ids referenced in a note's texts. */
function mediaRefs(note: Note): string[] {
  const texts = [...Object.values(note.fields), ...note.hints, note.explanation ?? ''];
  return [...new Set(texts.flatMap((t) => [...t.matchAll(MEDIA_REF)].map((m) => m[1] ?? '')))];
}

/**
 * Exports a deck subtree (or the whole collection) in an import-compatible format, so that
 * `import(export(x))` gives back x. `zip` bundles `deck.json` with the media files.
 */
export async function exportNotes(
  ctx: ServiceContext,
  opts: { deckId?: Id; format: ExportFormat },
): Promise<ExportResult> {
  const r = ctx.repo;
  const decks = await r.decks.list();
  const index = indexDecks(decks);
  const deckIds = opts.deckId ? index.subtree(opts.deckId) : decks.map((d) => d.id);
  const byId = new Map(decks.map((d) => [d.id, d] as const));
  const notes = deckIds.length ? await r.notes.byDeck(deckIds) : [];
  const types = new Map<string, NoteType>();
  const items: { note: Note; noteType: NoteType; deckPath: string }[] = [];
  for (const note of notes) {
    let noteType = types.get(note.noteTypeId);
    if (!noteType) {
      noteType = await resolveNoteType(r, note.noteTypeId);
      types.set(note.noteTypeId, noteType);
    }
    items.push({ note, noteType, deckPath: byId.get(note.deckId)?.name ?? '' });
  }
  const usedMedia = new Set(notes.flatMap(mediaRefs));
  const media = (await r.media.getMany([...usedMedia])).filter((m): m is Media => m !== undefined);
  const exportedDecks = deckIds
    .map((id) => byId.get(id))
    .filter((d): d is Deck => d !== undefined && Boolean(d.description))
    .map((d) => ({ path: d.name, description: d.description ?? '' }));
  const doc = buildImportDocument({ notes: items, decks: exportedDecks, media });
  const root = opts.deckId ? byId.get(opts.deckId)?.name : undefined;
  const base = root ? slug(root) : `${APP_SLUG}-collection`;

  if (opts.format !== 'zip') {
    const { text, warnings } = exportDocument(doc, opts.format);
    const { ext, mime } = EXT[opts.format];
    return { fileName: `${base}.${ext}`, mime, content: text, warnings, notes: items.length };
  }
  const { text, warnings } = exportDocument(doc, 'json');
  // Same file names as the document's media declarations (media/<name>).
  const names = mediaFileNames(media);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const m of media) {
    const bytes = await r.media.getContent(m.id);
    if (bytes) files.push({ name: names.get(m.id) ?? m.name, bytes });
  }
  const content = await writeBundle({ mainName: 'deck.json', mainText: text, media: files });
  return {
    fileName: `${base}.zip`,
    mime: 'application/zip',
    content,
    warnings,
    notes: items.length,
  };
}
