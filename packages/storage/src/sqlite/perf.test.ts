import { describe, expect, it } from 'vitest';
import type { Card, CardState, Note } from '@mnemo/core';
import { makeCard, makeNote } from '../testing';
import { createSqliteRepository } from '.';

const STATES: readonly CardState[] = ['new', 'learning', 'review', 'relearning'];

/** Performance sanity checks (generous bounds: they guard against accidental full scans/O(n²)). */
describe('sqlite repository performance', () => {
  it('writes 20 000 notes and 20 000 cards in one transaction in under 5 s', async () => {
    const repo = createSqliteRepository({ path: ':memory:' });
    const notes: Note[] = [];
    const cards: Card[] = [];
    for (let i = 0; i < 20_000; i++) {
      const id = `n${String(i).padStart(6, '0')}`;
      notes.push(
        makeNote({ id, deckId: `d${String(i % 10)}`, tags: ['perf', `t${String(i % 50)}`] }),
      );
      cards.push(makeCard({ id: `c${id}`, noteId: id, deckId: `d${String(i % 10)}` }));
    }
    const start = performance.now();
    await repo.transaction(async (tx) => {
      await tx.notes.putMany(notes);
      await tx.cards.putMany(cards);
    });
    const elapsed = performance.now() - start;
    expect(await repo.cards.count()).toBe(20_000);
    expect(elapsed).toBeLessThan(5_000);
    await repo.close();
  }, 30_000);

  it('answers dueBefore and newCards over 50 000 cards in under 200 ms', async () => {
    const repo = createSqliteRepository({ path: ':memory:' });
    const cards: Card[] = [];
    for (let i = 0; i < 50_000; i++) {
      const state = STATES[i % 4] ?? 'new';
      cards.push(
        makeCard({
          id: `c${String(i).padStart(6, '0')}`,
          deckId: `d${String(i % 20)}`,
          state,
          due: (i * 7919) % 100_000,
          ...(state === 'new' ? { newPosition: i } : {}),
        }),
      );
    }
    await repo.cards.putMany(cards);
    const decks = ['d0', 'd1', 'd2', 'd3'];

    let start = performance.now();
    const due = await repo.cards.dueBefore(decks, 10_000);
    const dueMs = performance.now() - start;
    start = performance.now();
    const fresh = await repo.cards.newCards(decks, 100);
    const newMs = performance.now() - start;

    expect(due.length).toBeGreaterThan(0);
    expect(fresh).toHaveLength(100);
    expect(dueMs).toBeLessThan(200);
    expect(newMs).toBeLessThan(200);
    await repo.close();
  }, 30_000);
});
