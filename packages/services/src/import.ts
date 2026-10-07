import type { Card, Id, ImportBatch, ImportMode, Note, NoteType } from '@mnemo/core';
import {
  DECK_SEPARATOR,
  builtinNoteType,
  noteFingerprintInput,
  normalizeDeckPath,
} from '@mnemo/core';
import type { ImportParseResult, ParsedNote } from '@mnemo/importers';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';
import { ensureDeckPath } from './decks';
import { importMedia, rewriteMediaRefs, type MediaPayload } from './importMedia';
import { applyNoteUpdate, insertNote, type NoteInput } from './notes';

export interface ImportOptions {
  mode: ImportMode;
  /** Deck used for notes without a deck (and the root of relative imports). */
  targetDeck: string;
  /** Indexes (ParsedNote.index) the user unticked in the preview. */
  excluded?: ReadonlySet<number>;
  fileName: string;
  /** Media files available for the import (from a .zip bundle or decoded data: URIs), by declared id. */
  media?: ReadonlyMap<string, MediaPayload>;
}

export type PlannedAction = 'create' | 'update' | 'skip' | 'excluded';

export interface ImportPlanItem {
  index: number;
  action: PlannedAction;
  deck: string;
  /** Existing note matched by uid or by content fingerprint. */
  existingId?: Id;
  matchedBy?: 'uid' | 'content';
}

export interface ImportPlan {
  items: ImportPlanItem[];
  counts: Record<PlannedAction, number>;
  decksToCreate: string[];
  /** replace-deck: notes that will be deleted first. */
  replaced: number;
}

function deckOf(note: ParsedNote, target: string): string {
  if (!note.deck) return normalizeDeckPath(target);
  return normalizeDeckPath(note.deck);
}

const noteTypeLike = (id: string): Pick<NoteType, 'id' | 'renderer' | 'fields' | 'templates'> =>
  builtinNoteType(id) ?? { id, renderer: 'template', fields: [{ name: 'Front' }], templates: [] };

/** Normalized content key used to spot duplicates without a uid (type + primary field). */
function contentKey(noteTypeId: string, fields: Record<string, string>): string {
  return noteFingerprintInput({ fields }, noteTypeLike(noteTypeId));
}

async function existingByContent(stores: Stores, deckIds: Map<string, Id>) {
  const map = new Map<string, Note>();
  const ids = [...deckIds.values()];
  if (ids.length === 0) return map;
  for (const n of await stores.notes.byDeck(ids)) {
    map.set(`${n.deckId}\u0001${contentKey(n.noteTypeId, n.fields)}`, n);
  }
  return map;
}

/** Decides, for every parsed note, whether it will be created, updated or skipped. Read-only. */
export async function planImport(
  ctx: ServiceContext,
  parsed: ImportParseResult,
  opts: Omit<ImportOptions, 'fileName' | 'media'>,
  stores: Stores = ctx.repo,
): Promise<ImportPlan> {
  const decks = await stores.decks.list();
  const deckIds = new Map(decks.map((d) => [d.name, d.id] as const));
  const byContent = await existingByContent(stores, deckIds);
  const items: ImportPlanItem[] = [];
  const counts: Record<PlannedAction, number> = { create: 0, update: 0, skip: 0, excluded: 0 };
  const targets = new Set<string>();
  for (const note of parsed.notes) {
    const deck = deckOf(note, opts.targetDeck);
    targets.add(deck);
    if (opts.excluded?.has(note.index)) {
      items.push({ index: note.index, action: 'excluded', deck });
      counts.excluded++;
      continue;
    }
    let existing: Note | undefined;
    let matchedBy: 'uid' | 'content' | undefined;
    if (note.uid) {
      existing = await stores.notes.findByUid(note.uid);
      if (existing) matchedBy = 'uid';
    }
    if (!existing) {
      const deckId = deckIds.get(deck);
      existing = deckId
        ? byContent.get(`${deckId}\u0001${contentKey(note.noteTypeId, note.fields)}`)
        : undefined;
      if (existing) matchedBy = 'content';
    }
    let action: PlannedAction = 'create';
    if (existing && opts.mode === 'skip-duplicates') action = 'skip';
    if (existing && opts.mode === 'update') action = 'update';
    const item: ImportPlanItem = { index: note.index, action, deck };
    if (existing && matchedBy && opts.mode !== 'add' && opts.mode !== 'replace-deck') {
      item.existingId = existing.id;
      item.matchedBy = matchedBy;
    }
    items.push(item);
    counts[action]++;
  }
  let replaced = 0;
  if (opts.mode === 'replace-deck') {
    const ids = [...targets].map((t) => deckIds.get(t)).filter((x): x is Id => x !== undefined);
    replaced = ids.length ? (await stores.notes.byDeck(ids)).length : 0;
  }
  const decksToCreate = [...targets].filter((t) => t && !deckIds.has(t)).sort();
  return { items, counts, decksToCreate, replaced };
}

function toInput(note: ParsedNote, deckId: Id, batchId: Id): NoteInput {
  const input: NoteInput = {
    noteTypeId: note.noteTypeId,
    deckId,
    fields: note.fields,
    tags: note.tags,
    hints: note.hints,
    importBatchId: batchId,
  };
  if (note.uid) input.uid = note.uid;
  if (note.data) input.data = note.data;
  if (note.explanation) input.explanation = note.explanation;
  if (note.source) input.source = note.source;
  if (note.difficulty !== undefined) input.difficulty = note.difficulty;
  if (note.needsReview) input.needsReview = true;
  return input;
}

/** Creates custom note types declared by the file (`custom:<id>`) that do not exist yet. */
async function ensureCustomTypes(ctx: ServiceContext, tx: Stores, parsed: ImportParseResult) {
  const now = ctx.clock.now();
  for (const def of parsed.noteTypes) {
    const id = `custom:${def.id}`;
    if (await tx.noteTypes.get(id)) continue;
    const record: NoteType = {
      id,
      name: def.name,
      builtin: false,
      renderer: 'template',
      fields: def.fields.map((name) => ({ name })),
      templates: def.templates,
      createdAt: now,
      updatedAt: now,
    };
    if (def.css) record.css = def.css;
    await tx.noteTypes.put(record);
  }
}

/** Applies deck descriptions and presets declared in the file (presets matched by name). */
async function applyDeckDecls(ctx: ServiceContext, tx: Stores, parsed: ImportParseResult) {
  const presets = await tx.presets.list();
  for (const decl of parsed.decks) {
    const deck = await ensureDeckPath(ctx, tx, decl.path);
    const preset = decl.preset ? presets.find((p) => p.name === decl.preset) : undefined;
    const next = { ...deck, updatedAt: ctx.clock.now() };
    if (decl.description) next.description = decl.description;
    if (preset) next.presetId = preset.id;
    await tx.decks.put(next);
  }
}

/**
 * Imports parsed notes atomically and records an ImportBatch so the import can be undone.
 * Existing notes keep their scheduling when updated.
 */
export async function applyImport(
  ctx: ServiceContext,
  parsed: ImportParseResult,
  opts: ImportOptions,
): Promise<ImportBatch> {
  return ctx.repo.transaction(async (tx) => {
    const batchId = ctx.newId();
    const now = ctx.clock.now();
    const plan = await planImport(ctx, parsed, opts, tx);
    await ensureCustomTypes(ctx, tx, parsed);
    await applyDeckDecls(ctx, tx, parsed);
    const mediaIds = await importMedia(ctx, tx, parsed.media, opts.media ?? new Map());
    const previousVersions: Note[] = [];
    const previousCards: Card[] = [];

    if (opts.mode === 'replace-deck') {
      const decks = await tx.decks.list();
      const targets = new Set(plan.items.map((i) => i.deck));
      const ids = decks.filter((d) => targets.has(d.name)).map((d) => d.id);
      const notes = ids.length ? await tx.notes.byDeck(ids) : [];
      const cards = await tx.cards.byNote(notes.map((n) => n.id));
      previousVersions.push(...notes);
      previousCards.push(...cards);
      await tx.notes.putMany(notes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
      await tx.cards.putMany(cards.map((c) => ({ ...c, deletedAt: now, updatedAt: now })));
    }

    const noteIds: Id[] = [];
    const byIndex = new Map(parsed.notes.map((n) => [n.index, n] as const));
    for (const item of plan.items) {
      const parsedNote = byIndex.get(item.index);
      if (!parsedNote || item.action === 'skip' || item.action === 'excluded') continue;
      const deck = await ensureDeckPath(ctx, tx, item.deck || 'Default');
      const input = rewriteMediaRefs(toInput(parsedNote, deck.id, batchId), mediaIds);
      if (item.action === 'update' && item.existingId) {
        const before = await tx.notes.get(item.existingId);
        if (before) {
          previousVersions.push(before);
          previousCards.push(...(await tx.cards.byNote([before.id])));
        }
        const { note } = await applyNoteUpdate(ctx, tx, item.existingId, input);
        noteIds.push(note.id);
      } else {
        if (opts.mode === 'add' && input.uid && (await tx.notes.findByUid(input.uid)))
          delete input.uid;
        const { note } = await insertNote(ctx, tx, input);
        noteIds.push(note.id);
      }
    }

    const batch: ImportBatch = {
      id: batchId,
      createdAt: now,
      fileName: opts.fileName,
      format: parsed.format,
      mode: opts.mode,
      counts: {
        created: plan.counts.create,
        updated: plan.counts.update,
        skipped: plan.counts.skip,
        excluded: plan.counts.excluded,
        replaced: plan.replaced,
        decksCreated: plan.decksToCreate.length,
      },
      report: parsed.report,
      noteIds,
      previousVersions,
      previousCards,
    };
    await tx.importBatches.put(batch);
    return batch;
  });
}

export class ImportUndoError extends Error {
  constructor(readonly code: 'not-found' | 'already-undone') {
    super(`Import cannot be undone: ${code}`);
    this.name = 'ImportUndoError';
  }
}

/** Undoes an import: created notes are deleted, updated or replaced notes are restored. */
export async function undoImport(ctx: ServiceContext, batchId: Id): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const batch = await tx.importBatches.get(batchId);
    if (!batch) throw new ImportUndoError('not-found');
    if (batch.undoneAt !== undefined) throw new ImportUndoError('already-undone');
    const now = ctx.clock.now();
    const restored = new Set(batch.previousVersions.map((n) => n.id));
    const created = batch.noteIds.filter((id) => !restored.has(id));
    const createdNotes = (await tx.notes.getMany(created)).filter((n): n is Note => !!n);
    const createdCards = await tx.cards.byNote(created);
    await tx.notes.putMany(createdNotes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
    await tx.cards.putMany(createdCards.map((c) => ({ ...c, deletedAt: now, updatedAt: now })));
    // Restored notes: drop cards created by the update, then put back the previous cards.
    const previousCardIds = new Set((batch.previousCards ?? []).map((c) => c.id));
    const current = await tx.cards.byNote([...restored]);
    await tx.cards.putMany(
      current
        .filter((c) => !previousCardIds.has(c.id))
        .map((c) => ({ ...c, deletedAt: now, updatedAt: now })),
    );
    await tx.notes.putMany(batch.previousVersions.map((n) => ({ ...n, updatedAt: now })));
    await tx.cards.putMany((batch.previousCards ?? []).map((c) => ({ ...c, updatedAt: now })));
    await tx.importBatches.put({ ...batch, undoneAt: now });
  });
}

export function listImportBatches(ctx: ServiceContext, limit = 50): Promise<ImportBatch[]> {
  return ctx.repo.importBatches.list(limit);
}

/** Joins a target deck and a relative path ("Cours" + "Chap 1" → "Cours::Chap 1"). */
export function joinDeckPath(root: string, relative: string): string {
  return normalizeDeckPath([root, relative].filter(Boolean).join(DECK_SEPARATOR));
}
