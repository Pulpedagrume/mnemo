import { beforeEach, describe, expect, it } from 'vitest';
import type { NoteSearch } from '../../repository';
import { makeCard, makeNote } from '../fixtures';
import type { RepoRef } from './entities';

/**
 * Search dataset (live notes n1, n2, n4, n5; n3 is a tombstone):
 * - deck A: n1 (created 1, updated 5), n2 (created 2, updated 4, mcq, needsReview), n3 (deleted)
 * - deck B: n4 (created 3, updated 3), n5 (created 4, updated 2)
 * Cards: n1 review; n2 new+suspended; n4 learning+leech; n5 new + a deleted relearning card.
 */
async function seed(repo: RepoRef): Promise<void> {
  await repo().notes.putMany([
    makeNote({
      id: 'n1',
      deckId: 'A',
      createdAt: 1,
      updatedAt: 5,
      fields: { front: 'Le Réseau local', back: 'LAN' },
      tags: ['Réseau::Ethernet', 'ccna', 'ccna'],
    }),
    makeNote({
      id: 'n2',
      deckId: 'A',
      noteTypeId: 'mcq',
      createdAt: 2,
      updatedAt: 4,
      tags: ['ccna'],
      needsReview: true,
      hints: ['Pensez à la COUCHE 2'],
      explanation: 'Trame Ethernet',
    }),
    makeNote({
      id: 'n3',
      deckId: 'A',
      createdAt: 0,
      updatedAt: 6,
      deletedAt: 6,
      tags: ['ccna', 'deleted-only'],
      fields: { front: 'Réseau supprimé' },
    }),
    makeNote({
      id: 'n4',
      deckId: 'B',
      createdAt: 3,
      updatedAt: 3,
      tags: ['reseau'],
      fields: { front: 'Routage' },
    }),
    makeNote({
      id: 'n5',
      deckId: 'B',
      createdAt: 4,
      updatedAt: 2,
      fields: { front: 'Commutation' },
      explanation: 'Café crème',
    }),
  ]);
  await repo().cards.putMany([
    makeCard({ id: 'c1', noteId: 'n1', deckId: 'A', state: 'review' }),
    makeCard({ id: 'c2', noteId: 'n2', deckId: 'A', state: 'new', suspended: true }),
    makeCard({ id: 'c3', noteId: 'n4', deckId: 'B', state: 'learning', leech: true }),
    makeCard({ id: 'c4', noteId: 'n5', deckId: 'B', state: 'relearning', deletedAt: 9 }),
    makeCard({ id: 'c5', noteId: 'n5', deckId: 'B', state: 'new' }),
    makeCard({ id: 'c6', noteId: 'n3', deckId: 'A', state: 'relearning' }),
  ]);
}

export function noteSuite(repo: RepoRef): void {
  describe('notes queries', () => {
    it('findByUid ignores deleted notes', async () => {
      await repo().notes.putMany([
        makeNote({ id: 'a', uid: 'u-1', deletedAt: 1 }),
        makeNote({ id: 'b', uid: 'u-1' }),
        makeNote({ id: 'c', uid: 'u-2', deletedAt: 1 }),
      ]);
      expect((await repo().notes.findByUid('u-1'))?.id).toBe('b');
      expect(await repo().notes.findByUid('u-2')).toBeUndefined();
      expect(await repo().notes.findByUid('nope')).toBeUndefined();
    });

    it('byDeck handles empty and multiple decks, without tombstones', async () => {
      await seed(repo);
      const ids = async (decks: string[]) =>
        (await repo().notes.byDeck(decks)).map((n) => n.id).sort();
      expect(await ids([])).toEqual([]);
      expect(await ids(['A'])).toEqual(['n1', 'n2']);
      expect(await ids(['A', 'B', 'Z'])).toEqual(['n1', 'n2', 'n4', 'n5']);
    });

    it('tagCounts counts each live note once per tag, sorted by tag', async () => {
      expect(await repo().notes.tagCounts()).toEqual([]);
      await seed(repo);
      expect(await repo().notes.tagCounts()).toEqual([
        { tag: 'Réseau::Ethernet', count: 1 },
        { tag: 'ccna', count: 2 },
        { tag: 'reseau', count: 1 },
      ]);
    });
  });

  describe('notes.search', () => {
    beforeEach(() => seed(repo));
    const ids = async (query: NoteSearch) =>
      (await repo().notes.search(query)).notes.map((n) => n.id);

    it('returns every live note by creation date without filters', async () => {
      const result = await repo().notes.search({});
      expect(result.total).toBe(4);
      expect(result.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n4', 'n5']);
    });

    it('filters by decks and note types (empty lists match nothing)', async () => {
      expect(await ids({ deckIds: ['A'] })).toEqual(['n1', 'n2']);
      expect(await ids({ deckIds: ['A', 'B'] })).toEqual(['n1', 'n2', 'n4', 'n5']);
      expect(await ids({ deckIds: [] })).toEqual([]);
      expect(await ids({ noteTypeIds: ['mcq'] })).toEqual(['n2']);
      expect(await ids({ noteTypeIds: ['basic', 'mcq'] })).toEqual(['n1', 'n2', 'n4', 'n5']);
      expect(await ids({ noteTypeIds: [] })).toEqual([]);
    });

    it('filters by tags: case-insensitive, parent matches children, all tags required', async () => {
      expect(await ids({ tags: ['CCNA'] })).toEqual(['n1', 'n2']);
      expect(await ids({ tags: ['réseau'] })).toEqual(['n1']);
      expect(await ids({ tags: ['RÉSEAU::ethernet'] })).toEqual(['n1']);
      expect(await ids({ tags: ['réseau::eth'] })).toEqual([]);
      expect(await ids({ tags: ['ccna', 'réseau'] })).toEqual(['n1']);
      expect(await ids({ tags: [] })).toEqual(['n1', 'n2', 'n4', 'n5']);
    });

    it('filters by text over fields, hints, explanation and tags, ignoring case and accents', async () => {
      expect(await ids({ text: 'reseau' })).toEqual(['n1', 'n4']);
      expect(await ids({ text: 'RÉSEAU LOCAL' })).toEqual(['n1']);
      expect(await ids({ text: 'couche 2' })).toEqual(['n2']);
      expect(await ids({ text: 'trame' })).toEqual(['n2']);
      expect(await ids({ text: 'cafe' })).toEqual(['n5']);
      expect(await ids({ text: 'ethernet' })).toEqual(['n1', 'n2']);
      expect(await ids({ text: 'lan' })).toEqual(['n1']);
      expect(await ids({ text: '  ' })).toEqual(['n1', 'n2', 'n4', 'n5']);
      expect(await ids({ text: 'introuvable' })).toEqual([]);
    });

    it('filters by needsReview', async () => {
      expect(await ids({ needsReview: true })).toEqual(['n2']);
      expect(await ids({ needsReview: false })).toEqual(['n1', 'n4', 'n5']);
    });

    it('filters by card state, suspension and leech using live cards only', async () => {
      expect(await ids({ cardState: 'review' })).toEqual(['n1']);
      expect(await ids({ cardState: 'new' })).toEqual(['n2', 'n5']);
      expect(await ids({ cardState: 'relearning' })).toEqual([]);
      expect(await ids({ suspended: true })).toEqual(['n2']);
      expect(await ids({ suspended: false })).toEqual(['n1', 'n4', 'n5']);
      expect(await ids({ leech: true })).toEqual(['n4']);
      expect(await ids({ leech: false })).toEqual(['n1', 'n2', 'n5']);
    });

    it('combines filters (card filters must hold on the same card)', async () => {
      expect(await ids({ cardState: 'new', suspended: false })).toEqual(['n5']);
      expect(await ids({ deckIds: ['A'], tags: ['ccna'], text: 'trame' })).toEqual(['n2']);
      expect(await ids({ deckIds: ['B'], cardState: 'new' })).toEqual(['n5']);
      expect(await ids({ noteTypeIds: ['basic'], suspended: true })).toEqual([]);
      expect(await ids({ tags: ['ccna'], needsReview: false, text: 'réseau' })).toEqual(['n1']);
    });

    it('sorts by created or updated, ascending or descending', async () => {
      expect(await ids({ sort: 'created', descending: true })).toEqual(['n5', 'n4', 'n2', 'n1']);
      expect(await ids({ sort: 'updated' })).toEqual(['n5', 'n4', 'n2', 'n1']);
      expect(await ids({ sort: 'updated', descending: true })).toEqual(['n1', 'n2', 'n4', 'n5']);
    });

    it('paginates with offset and limit and reports the total', async () => {
      const page = await repo().notes.search({ offset: 1, limit: 2 });
      expect(page.notes.map((n) => n.id)).toEqual(['n2', 'n4']);
      expect(page.total).toBe(4);
      expect(await repo().notes.search({ offset: 10 })).toEqual({ notes: [], total: 4 });
      expect(await repo().notes.search({ limit: 0 })).toEqual({ notes: [], total: 4 });
      const filtered = await repo().notes.search({ deckIds: ['B'], limit: 1 });
      expect(filtered.total).toBe(2);
      expect(filtered.notes.map((n) => n.id)).toEqual(['n4']);
    });

    it('returns complete notes', async () => {
      const stored = await repo().notes.get('n2');
      expect((await repo().notes.search({ noteTypeIds: ['mcq'] })).notes).toStrictEqual([stored]);
    });
  });
}
