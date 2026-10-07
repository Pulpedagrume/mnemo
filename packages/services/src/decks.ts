import type { Deck, Id } from '@mnemo/core';
import { DECK_SEPARATOR, deckPathSegments, normalizeDeckPath } from '@mnemo/core';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';

export class DeckError extends Error {
  constructor(
    readonly code: 'empty-name' | 'not-found' | 'name-taken' | 'cycle',
    message: string,
  ) {
    super(message);
    this.name = 'DeckError';
  }
}

async function liveDecks(stores: Stores): Promise<Deck[]> {
  return stores.decks.list();
}

/**
 * Returns the deck at `path`, creating it and any missing ancestors ("A::B::C").
 * Matching is exact on the normalized path.
 */
export async function ensureDeckPath(
  ctx: ServiceContext,
  stores: Stores,
  path: string,
): Promise<Deck> {
  const segments = deckPathSegments(path);
  if (segments.length === 0) throw new DeckError('empty-name', 'Deck name is empty');
  const decks = await liveDecks(stores);
  const byName = new Map(decks.map((d) => [d.name, d] as const));
  let parent: Deck | undefined;
  for (let i = 0; i < segments.length; i++) {
    const name = segments.slice(0, i + 1).join(DECK_SEPARATOR);
    let deck = byName.get(name);
    if (!deck) {
      const now = ctx.clock.now();
      deck = { id: ctx.newId(), name, createdAt: now, updatedAt: now };
      if (parent) deck.parentId = parent.id;
      await stores.decks.put(deck);
      byName.set(name, deck);
    }
    parent = deck;
  }
  return parent as Deck;
}

export function createDeck(ctx: ServiceContext, path: string): Promise<Deck> {
  return ctx.repo.transaction((tx) => ensureDeckPath(ctx, tx, path));
}

export function listDecks(ctx: ServiceContext): Promise<Deck[]> {
  return liveDecks(ctx.repo);
}

/** Renames/moves a deck by giving its new full path; descendants follow. */
export async function renameDeck(ctx: ServiceContext, id: Id, newPath: string): Promise<Deck> {
  const target = normalizeDeckPath(newPath);
  if (!target) throw new DeckError('empty-name', 'Deck name is empty');
  return ctx.repo.transaction(async (tx) => {
    const decks = await liveDecks(tx);
    const deck = decks.find((d) => d.id === id);
    if (!deck) throw new DeckError('not-found', `Deck ${id} not found`);
    if (target === deck.name) return deck;
    if (target.startsWith(deck.name + DECK_SEPARATOR))
      throw new DeckError('cycle', 'A deck cannot be moved inside itself');
    if (decks.some((d) => d.name === target))
      throw new DeckError('name-taken', `A deck named "${target}" already exists`);
    const parentPath = deckPathSegments(target).slice(0, -1).join(DECK_SEPARATOR);
    const parent = parentPath ? await ensureDeckPath(ctx, tx, parentPath) : undefined;
    const now = ctx.clock.now();
    const updated: Deck = { ...deck, name: target, updatedAt: now };
    if (parent) updated.parentId = parent.id;
    else delete updated.parentId;
    await tx.decks.put(updated);
    const prefix = deck.name + DECK_SEPARATOR;
    for (const d of decks) {
      if (d.name.startsWith(prefix)) {
        await tx.decks.put({
          ...d,
          name: target + DECK_SEPARATOR + d.name.slice(prefix.length),
          updatedAt: now,
        });
      }
    }
    return updated;
  });
}

export async function updateDeck(
  ctx: ServiceContext,
  id: Id,
  patch: { presetId?: Id | null; description?: string },
): Promise<Deck> {
  return ctx.repo.transaction(async (tx) => {
    const deck = await tx.decks.get(id);
    if (!deck) throw new DeckError('not-found', `Deck ${id} not found`);
    const updated: Deck = { ...deck, updatedAt: ctx.clock.now() };
    if (patch.presetId === null) delete updated.presetId;
    else if (patch.presetId !== undefined) updated.presetId = patch.presetId;
    if (patch.description !== undefined) updated.description = patch.description;
    await tx.decks.put(updated);
    return updated;
  });
}

/** Soft-deletes a deck, its sub-decks, and all their notes and cards. */
export async function deleteDeck(ctx: ServiceContext, id: Id): Promise<{ notes: number }> {
  return ctx.repo.transaction(async (tx) => {
    const decks = await liveDecks(tx);
    const root = decks.find((d) => d.id === id);
    if (!root) throw new DeckError('not-found', `Deck ${id} not found`);
    const doomed = decks.filter(
      (d) => d.id === id || d.name.startsWith(root.name + DECK_SEPARATOR),
    );
    const ids = doomed.map((d) => d.id);
    const now = ctx.clock.now();
    const notes = await tx.notes.byDeck(ids);
    const cards = await tx.cards.byDeck(ids);
    await tx.notes.putMany(notes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
    await tx.cards.putMany(cards.map((c) => ({ ...c, deletedAt: now, updatedAt: now })));
    await tx.decks.putMany(doomed.map((d) => ({ ...d, deletedAt: now, updatedAt: now })));
    return { notes: notes.length };
  });
}
