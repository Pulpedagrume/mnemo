import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Card, Note, ReviewLog, SettingRow } from '@mnemo/core';
import { makeCard, makeDeck, makeNote, makeReviewLog } from '@mnemo/storage/testing';
import { encodeHlc } from './hlc';
import { changeKey, mergeChange, mergeEntity } from './merge';
import { stampEntity } from './stamp';

const h = (wall: number, node = 'a', counter = 0): string => encodeHlc({ wall, counter, node });

const arbClock = fc
  .tuple(fc.integer({ min: 1, max: 4 }), fc.constantFrom('a', 'b', ''))
  .map(([w, n]) => h(w, n));
const arbSync = fc.option(
  fc.record(
    {
      hlc: arbClock,
      fields: fc.dictionary(
        fc.constantFrom(
          'fields',
          'fields.front',
          'fields.back',
          'tags',
          'deckId',
          'due',
          'state',
          'flag',
        ),
        arbClock,
      ),
    },
    { requiredKeys: ['hlc'] },
  ),
  { nil: undefined },
);
const arbDeleted = fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined });

const arbNote: fc.Arbitrary<Note> = fc
  .record({
    front: fc.constantFrom('q1', 'q2'),
    back: fc.option(fc.constantFrom('a1', 'a2'), { nil: undefined }),
    tags: fc.constantFrom('', 'x', 'y').map((t) => (t ? [t] : [])),
    deckId: fc.constantFrom('d1', 'd2'),
    explanation: fc.option(fc.constantFrom('e1', 'e2'), { nil: undefined }),
    updatedAt: fc.integer({ min: 1, max: 4 }),
    deletedAt: arbDeleted,
    sync: arbSync,
  })
  .map(({ front, back, ...r }): Note => ({
    ...makeNote({ id: 'n1' }),
    ...r,
    fields: back ? { front, back } : { front },
  }));

const arbCard: fc.Arbitrary<Card> = fc
  .record({
    state: fc.constantFrom('new', 'review'),
    due: fc.integer({ min: 1, max: 3 }),
    reps: fc.integer({ min: 0, max: 2 }),
    lastReview: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
    flag: fc.integer({ min: 0, max: 2 }),
    deckId: fc.constantFrom('d1', 'd2'),
    updatedAt: fc.integer({ min: 1, max: 4 }),
    deletedAt: arbDeleted,
    sync: arbSync,
  })
  .map((r) => ({ ...makeCard({ id: 'c1' }), ...r }));

const arbLog: fc.Arbitrary<ReviewLog> = fc
  .record({ deletedAt: arbDeleted, sync: arbSync, durationMs: fc.constantFrom(1, 2) })
  .map((r) => ({ ...makeReviewLog({ id: 'l1' }), ...r }));

const arbSetting: fc.Arbitrary<SettingRow> = fc.record(
  {
    key: fc.constant('theme'),
    value: fc.constantFrom('dark', 'light'),
    updatedAt: fc.integer({ min: 1, max: 3 }),
    hlc: arbClock,
  },
  { requiredKeys: ['key', 'value', 'updatedAt'] },
);

function laws<T>(kind: string, arb: fc.Arbitrary<T>, m: (a: T, b: T) => T): void {
  describe(`${kind} merge`, () => {
    it('is commutative', () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          expect(m(a, b)).toEqual(m(b, a));
        }),
      );
    });
    it('is idempotent', () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          const ab = m(a, b);
          expect(m(a, ab)).toEqual(ab);
          expect(m(ab, ab)).toEqual(ab);
        }),
      );
    });
    it('is associative', () => {
      fc.assert(
        fc.property(arb, arb, arb, (a, b, c) => {
          expect(m(m(a, b), c)).toEqual(m(a, m(b, c)));
        }),
      );
    });
  });
}

laws('note', arbNote, (a, b) => mergeEntity('note', a, b));
laws('card', arbCard, (a, b) => mergeEntity('card', a, b));
laws('reviewLog', arbLog, (a, b) => mergeEntity('reviewLog', a, b));
laws('setting', arbSetting, (a, b) => mergeEntity('setting', a, b));

describe('merge rules', () => {
  const base = makeNote({ id: 'n', fields: { front: 'Q', back: 'A' }, tags: ['t'] });

  it('keeps concurrent edits of different fields and the latest edit of the same field', () => {
    const a = { ...base, tags: ['ta'], sync: { hlc: h(10, 'a'), fields: { fields: h(1) } } };
    const b = {
      ...base,
      fields: { front: 'Q2', back: 'A' },
      sync: { hlc: h(12, 'b'), fields: { tags: h(1) } },
    };
    const merged = mergeEntity('note', a, b);
    expect(merged.tags).toEqual(['ta']);
    expect(merged.fields).toEqual({ front: 'Q2', back: 'A' });
    expect(merged.sync?.hlc).toBe(h(12, 'b'));
    const later = { ...b, tags: ['tb'], sync: { hlc: h(15, 'b'), fields: { tags: h(15, 'b') } } };
    expect(mergeEntity('note', a, later).tags).toEqual(['tb']);
  });

  it('merges note fields entry by entry', () => {
    const a = {
      ...base,
      fields: { front: 'QA', back: 'A' },
      sync: { hlc: h(10, 'a'), fields: { 'fields.back': h(1), tags: h(1) } },
    };
    const b = {
      ...base,
      fields: { front: 'Q', back: 'AB' },
      sync: { hlc: h(12, 'b'), fields: { 'fields.front': h(1), tags: h(1) } },
    };
    expect(mergeEntity('note', a, b).fields).toEqual({ front: 'QA', back: 'AB' });
  });

  it('keeps a field added remotely despite an unrelated, later local edit', () => {
    let t = 0;
    const now = (node: string) => () => h(++t, node);
    const created = stampEntity(undefined, base, now('a'));
    const remote = stampEntity(created, { ...created, explanation: 'why' }, now('a'));
    const local = stampEntity(created, { ...created, tags: ['later'] }, now('b'));
    const merged = mergeEntity('note', local, remote);
    expect(merged.explanation).toBe('why');
    expect(merged.tags).toEqual(['later']);
  });

  it('falls back to updatedAt when there is no sync metadata', () => {
    const older = { ...base, tags: ['old'], updatedAt: 1 };
    const newer = { ...base, tags: ['new'], updatedAt: 2 };
    expect(mergeEntity('note', older, newer).tags).toEqual(['new']);
    expect(mergeEntity('note', newer, older).updatedAt).toBe(2);
  });

  it('makes deletion sticky', () => {
    const deleted = { ...base, deletedAt: 5, sync: { hlc: h(5) } };
    const edited = { ...base, tags: ['z'], sync: { hlc: h(9, 'b') } };
    const merged = mergeEntity('note', deleted, edited);
    expect(merged.deletedAt).toBe(5);
    expect(merged.tags).toEqual(['z']);
  });

  it('takes card scheduling from the latest review and other card fields by LWW', () => {
    const card = makeCard({ id: 'c' });
    const a: Card = {
      ...card,
      state: 'review',
      reps: 1,
      lastReview: 100,
      flag: 2,
      sync: { hlc: h(50, 'a') },
    };
    const b: Card = {
      ...card,
      state: 'learning',
      reps: 1,
      lastReview: 90,
      sync: { hlc: h(60, 'b') },
    };
    const merged = mergeEntity('card', a, b);
    expect(merged.state).toBe('review');
    expect(merged.lastReview).toBe(100);
    expect(merged.flag).toBe(0);
  });

  it('applies a review log tombstone and LWW on settings', () => {
    const log = makeReviewLog({ id: 'l' });
    expect(mergeEntity('reviewLog', log, { ...log, deletedAt: 3 }).deletedAt).toBe(3);
    const s1: SettingRow = { key: 'k', value: 1, updatedAt: 9, hlc: h(1) };
    const s2: SettingRow = { key: 'k', value: 2, updatedAt: 1, hlc: h(2) };
    expect(mergeEntity('setting', s1, s2).value).toBe(2);
    expect(mergeEntity('setting', undefined, s1)).toBe(s1);
  });

  it('reports conflicts and change keys', () => {
    const deck = makeDeck({ id: 'd' });
    const newer = { ...deck, name: 'B', updatedAt: deck.updatedAt + 1 };
    expect(mergeChange('deck', deck, newer).conflict).toBe(false);
    expect(mergeChange('deck', newer, deck).conflict).toBe(true);
    expect(mergeChange('deck', undefined, deck).conflict).toBe(false);
    expect(changeKey({ kind: 'deck', data: deck })).toBe('deck:d');
    expect(changeKey({ kind: 'setting', data: { key: 'k', value: 1, updatedAt: 0 } })).toBe(
      'setting:k',
    );
  });
});
