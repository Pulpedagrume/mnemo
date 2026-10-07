import type { Card, Id, Note, NoteType } from '@mnemo/core';
import {
  FIELD,
  NoteSchema,
  blankMemory,
  builtinNoteType,
  diffCardOrds,
  generateCardOrds,
  getField,
  parseCloze,
} from '@mnemo/core';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';

export class NoteError extends Error {
  constructor(
    readonly code: 'unknown-note-type' | 'no-cards' | 'invalid-cloze' | 'invalid' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'NoteError';
  }
}

/** Editable part of a note. */
export type NoteInput = Pick<Note, 'noteTypeId' | 'deckId' | 'fields' | 'tags' | 'hints'> &
  Partial<
    Pick<
      Note,
      'uid' | 'data' | 'explanation' | 'source' | 'difficulty' | 'needsReview' | 'importBatchId'
    >
  >;

/** Note type by id: stored record first, then the built-in definition. */
export async function resolveNoteType(stores: Stores, id: Id): Promise<NoteType> {
  const stored = await stores.noteTypes.get(id);
  if (stored) return stored;
  const builtin = builtinNoteType(id);
  if (builtin) return { ...builtin, createdAt: 0, updatedAt: 0 };
  throw new NoteError('unknown-note-type', `Unknown note type: ${id}`);
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

/** Validates content and returns the ords of the cards it generates. */
function checkNote(note: Note, noteType: NoteType): number[] {
  const parsed = NoteSchema.safeParse(note);
  if (!parsed.success) throw new NoteError('invalid', parsed.error.message);
  if (noteType.renderer === 'cloze') {
    const errors = parseCloze(getField(note.fields, FIELD.text)).problems.filter(
      (p) => p.severity === 'error',
    );
    if (errors.length > 0)
      throw new NoteError('invalid-cloze', errors.map((e) => e.message.en).join('; '));
  }
  const ords = generateCardOrds(note, noteType);
  if (ords.length === 0) throw new NoteError('no-cards', 'This note would not produce any card');
  return ords;
}

function newCard(ctx: ServiceContext, note: Note, ord: number, position: number): Card {
  const now = ctx.clock.now();
  return {
    ...blankMemory(now),
    id: ctx.newId(),
    noteId: note.id,
    ord,
    deckId: note.deckId,
    newPosition: position,
    suspended: false,
    flag: 0,
    leech: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates a note and its cards inside an existing transaction. */
export async function insertNote(
  ctx: ServiceContext,
  stores: Stores,
  input: NoteInput,
): Promise<{ note: Note; cards: Card[] }> {
  const now = ctx.clock.now();
  const note: Note = {
    ...input,
    id: ctx.newId(),
    tags: normalizeTags(input.tags),
    createdAt: now,
    updatedAt: now,
  };
  const noteType = await resolveNoteType(stores, note.noteTypeId);
  const ords = checkNote(note, noteType);
  let position = (await stores.cards.maxNewPosition()) + 1;
  const cards = ords.map((ord) => newCard(ctx, note, ord, position++));
  await stores.notes.put(note);
  await stores.cards.putMany(cards);
  return { note, cards };
}

export function createNote(ctx: ServiceContext, input: NoteInput) {
  return ctx.repo.transaction((tx) => insertNote(ctx, tx, input));
}

/**
 * Updates a note inside a transaction. Cards keep their scheduling; cards for new template/cloze
 * numbers are created, cards no longer generated are deleted, and cards follow the note's deck.
 */
export async function applyNoteUpdate(
  ctx: ServiceContext,
  stores: Stores,
  id: Id,
  input: Partial<NoteInput>,
): Promise<{ note: Note; created: Card[]; deleted: Card[] }> {
  const existing = await stores.notes.get(id);
  if (!existing) throw new NoteError('not-found', `Note ${id} not found`);
  const now = ctx.clock.now();
  const note: Note = { ...existing, ...input, id, updatedAt: now };
  if (input.tags) note.tags = normalizeTags(input.tags);
  const noteType = await resolveNoteType(stores, note.noteTypeId);
  const ords = checkNote(note, noteType);
  const cards = await stores.cards.byNote([id]);
  const { toCreate, toDelete } = diffCardOrds(
    cards.map((c) => c.ord),
    ords,
  );
  let position = (await stores.cards.maxNewPosition()) + 1;
  const created = toCreate.map((ord) => newCard(ctx, note, ord, position++));
  const deleted = cards
    .filter((c) => toDelete.includes(c.ord))
    .map((c) => ({ ...c, deletedAt: now, updatedAt: now }));
  const moved = cards
    .filter((c) => !toDelete.includes(c.ord) && c.deckId !== note.deckId)
    .map((c) => ({ ...c, deckId: note.deckId, updatedAt: now }));
  await stores.notes.put(note);
  await stores.cards.putMany([...created, ...deleted, ...moved]);
  return { note, created, deleted };
}

export function updateNote(ctx: ServiceContext, id: Id, input: Partial<NoteInput>) {
  return ctx.repo.transaction((tx) => applyNoteUpdate(ctx, tx, id, input));
}

/** Soft-deletes notes and their cards. */
export async function deleteNotes(ctx: ServiceContext, ids: readonly Id[]): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const now = ctx.clock.now();
    const notes = (await tx.notes.getMany(ids)).filter((n): n is Note => n !== undefined);
    const cards = await tx.cards.byNote(ids);
    await tx.notes.putMany(notes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
    await tx.cards.putMany(cards.map((c) => ({ ...c, deletedAt: now, updatedAt: now })));
  });
}

export async function getNoteWithCards(
  ctx: ServiceContext,
  id: Id,
): Promise<{ note: Note; noteType: NoteType; cards: Card[] } | undefined> {
  const note = await ctx.repo.notes.get(id);
  if (!note) return undefined;
  const noteType = await resolveNoteType(ctx.repo, note.noteTypeId);
  const cards = (await ctx.repo.cards.byNote([id])).sort((a, b) => a.ord - b.ord);
  return { note, noteType, cards };
}

/** Bulk operations from the browser. */
export async function bulkUpdateNotes(
  ctx: ServiceContext,
  ids: readonly Id[],
  op:
    | { kind: 'move'; deckId: Id }
    | { kind: 'addTags'; tags: string[] }
    | { kind: 'removeTags'; tags: string[] },
): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const notes = (await tx.notes.getMany(ids)).filter((n): n is Note => n !== undefined);
    for (const n of notes) {
      if (op.kind === 'move') await applyNoteUpdate(ctx, tx, n.id, { deckId: op.deckId });
      else {
        const lower = new Set(op.tags.map((t) => t.toLowerCase()));
        const tags =
          op.kind === 'addTags'
            ? [...n.tags, ...op.tags]
            : n.tags.filter((t) => !lower.has(t.toLowerCase()));
        await tx.notes.put({ ...n, tags: normalizeTags(tags), updatedAt: ctx.clock.now() });
      }
    }
  });
}

/** Card-level bulk operations (suspend, unsuspend, flag, bury). */
export async function updateCards(
  ctx: ServiceContext,
  cardIds: readonly Id[],
  patch: Partial<Pick<Card, 'suspended' | 'flag' | 'buriedUntil' | 'leech'>>,
): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const now = ctx.clock.now();
    const cards = (await tx.cards.getMany(cardIds)).filter((c): c is Card => c !== undefined);
    await tx.cards.putMany(cards.map((c) => ({ ...c, ...patch, updatedAt: now })));
  });
}

/** Suspends or unsuspends every card of the given notes. */
export async function setNotesSuspended(
  ctx: ServiceContext,
  noteIds: readonly Id[],
  suspended: boolean,
) {
  const cards = await ctx.repo.cards.byNote(noteIds);
  await updateCards(
    ctx,
    cards.map((c) => c.id),
    { suspended },
  );
}

/** Stored note types (built-ins are seeded at bootstrap), built-ins first then by name. */
export async function listNoteTypes(ctx: ServiceContext): Promise<NoteType[]> {
  const stored = await ctx.repo.noteTypes.list();
  return stored.sort(
    (a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name),
  );
}
