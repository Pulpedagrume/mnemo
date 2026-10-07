import { describe, expect, it } from 'vitest';
import { makeCard } from '../fixtures';
import type { RepoRef } from './entities';

export function cardSuite(repo: RepoRef): void {
  describe('cards queries', () => {
    const idsOf = (cards: { id: string }[]) => cards.map((c) => c.id);

    it('byNote and byDeck handle empty lists, several keys and tombstones', async () => {
      await repo().cards.putMany([
        makeCard({ id: 'a1', noteId: 'n1', deckId: 'A' }),
        makeCard({ id: 'a2', noteId: 'n1', deckId: 'B', ord: 1 }),
        makeCard({ id: 'b1', noteId: 'n2', deckId: 'B' }),
        makeCard({ id: 'x', noteId: 'n2', deckId: 'A', deletedAt: 1 }),
      ]);
      const sorted = (cards: { id: string }[]) => idsOf(cards).sort();
      expect(await repo().cards.byNote([])).toEqual([]);
      expect(sorted(await repo().cards.byNote(['n1']))).toEqual(['a1', 'a2']);
      expect(sorted(await repo().cards.byNote(['n1', 'n2']))).toEqual(['a1', 'a2', 'b1']);
      expect(await repo().cards.byDeck([])).toEqual([]);
      expect(sorted(await repo().cards.byDeck(['A']))).toEqual(['a1']);
      expect(sorted(await repo().cards.byDeck(['A', 'B']))).toEqual(['a1', 'a2', 'b1']);
    });

    it('dueBefore returns non-new, non-suspended live cards with due < before, by due', async () => {
      await repo().cards.putMany([
        makeCard({ id: 'r1', deckId: 'A', state: 'review', due: 300 }),
        makeCard({ id: 'r2', deckId: 'A', state: 'learning', due: 100 }),
        makeCard({ id: 'r3', deckId: 'A', state: 'relearning', due: 200 }),
        makeCard({ id: 'r4', deckId: 'A', state: 'review', due: 200 }),
        makeCard({ id: 'new', deckId: 'A', state: 'new', due: 50 }),
        makeCard({ id: 'susp', deckId: 'A', state: 'review', due: 10, suspended: true }),
        makeCard({ id: 'dead', deckId: 'A', state: 'review', due: 20, deletedAt: 1 }),
        makeCard({ id: 'edge', deckId: 'A', state: 'review', due: 400 }),
        makeCard({ id: 'late', deckId: 'A', state: 'review', due: 500 }),
        makeCard({ id: 'b', deckId: 'B', state: 'review', due: 150 }),
        makeCard({ id: 'c', deckId: 'C', state: 'review', due: 0 }),
      ]);
      expect(await repo().cards.dueBefore([], 400)).toEqual([]);
      expect(idsOf(await repo().cards.dueBefore(['A'], 400))).toEqual(['r2', 'r3', 'r4', 'r1']);
      expect(idsOf(await repo().cards.dueBefore(['A', 'B'], 400))).toEqual([
        'r2',
        'b',
        'r3',
        'r4',
        'r1',
      ]);
      expect(idsOf(await repo().cards.dueBefore(['A', 'A'], 101))).toEqual(['r2']);
      expect(await repo().cards.dueBefore(['A'], 100)).toEqual([]);
    });

    it('newCards returns new, non-suspended live cards by newPosition then id, limited', async () => {
      await repo().cards.putMany([
        makeCard({ id: 'b', deckId: 'A', newPosition: 2 }),
        makeCard({ id: 'z', deckId: 'A', newPosition: 1 }),
        makeCard({ id: 'a', deckId: 'A', newPosition: 2 }),
        makeCard({ id: 'nopos', deckId: 'A' }),
        makeCard({ id: 'susp', deckId: 'A', newPosition: 0, suspended: true }),
        makeCard({ id: 'dead', deckId: 'A', newPosition: 0, deletedAt: 1 }),
        makeCard({ id: 'seen', deckId: 'A', newPosition: 0, state: 'review' }),
        makeCard({ id: 'other', deckId: 'B', newPosition: 0 }),
      ]);
      expect(idsOf(await repo().cards.newCards(['A'], 10))).toEqual(['z', 'a', 'b', 'nopos']);
      expect(idsOf(await repo().cards.newCards(['A', 'B'], 2))).toEqual(['other', 'z']);
      expect(await repo().cards.newCards(['A'], 0)).toEqual([]);
      expect(await repo().cards.newCards([], 5)).toEqual([]);
    });

    it('maxNewPosition is -1 when empty and ignores tombstones', async () => {
      expect(await repo().cards.maxNewPosition()).toBe(-1);
      await repo().cards.put(makeCard({ id: 'nopos' }));
      expect(await repo().cards.maxNewPosition()).toBe(-1);
      await repo().cards.putMany([
        makeCard({ id: 'a', newPosition: 3 }),
        makeCard({ id: 'b', newPosition: 7, state: 'review' }),
        makeCard({ id: 'c', newPosition: 9, deletedAt: 1 }),
      ]);
      expect(await repo().cards.maxNewPosition()).toBe(7);
    });
  });
}
