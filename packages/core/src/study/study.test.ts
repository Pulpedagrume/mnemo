import { describe, expect, it } from 'vitest';
import type { Card, CardMemory, Deck, Preset, Rating } from '../model';
import { DEFAULT_BEHAVIOR, DEFAULT_LIMITS, blankMemory } from '../model';
import { seededRng } from '../rng';
import type { AnyScheduler } from '../scheduling/types';
import { DAY_MS, HOUR_MS, MINUTE_MS, studyCalendar } from '../time';
import {
  afterAnswer,
  answerCard,
  applyHintPolicy,
  buildDeckTree,
  buildQueue,
  indexDecks,
  nextCard,
  ratingsForButtons,
  removeFromQueue,
  resolveDeckPreset,
  type QueueInput,
  type TodayReview,
} from './index';

// core has no DOM/Node typings; the global exists in every runtime we test on.
declare const performance: { now(): number };

const cal = studyCalendar('UTC', 4);
const NOW = Date.UTC(2026, 9, 7, 10, 0); // 10:00 UTC
const TODAY_END = cal.startOf(cal.today(NOW) + 1);

function deck(id: string, name: string, parentId?: string, presetId?: string): Deck {
  const d: Deck = { id, name, createdAt: 0, updatedAt: 0 };
  if (parentId) d.parentId = parentId;
  if (presetId) d.presetId = presetId;
  return d;
}

function preset(id: string, limits: Partial<Preset['limits']> = {}, behavior = {}): Preset {
  return {
    id,
    name: id,
    algorithm: 'stub',
    params: {},
    limits: { ...DEFAULT_LIMITS, ...limits },
    behavior: { ...DEFAULT_BEHAVIOR, ...behavior },
    createdAt: 0,
    updatedAt: 0,
  };
}

let seq = 0;
function card(over: Partial<Card> & { deckId: string }): Card {
  seq++;
  return {
    ...blankMemory(0),
    id: `c${String(seq).padStart(6, '0')}`,
    noteId: `n${seq}`,
    ord: 0,
    newPosition: seq,
    suspended: false,
    flag: 0,
    leech: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const review = (deckId: string, due = NOW - DAY_MS, over: Partial<Card> = {}) =>
  card({ deckId, state: 'review', due, interval: 3, ...over });

const decks = [deck('root', 'Root'), deck('a', 'Root::A', 'root'), deck('b', 'Root::B', 'root')];
const index = indexDecks(decks);

function input(cards: Card[], over: Partial<QueueInput> = {}): QueueInput {
  const p = preset('p');
  return {
    now: NOW,
    calendar: cal,
    rootDeckId: 'root',
    decks: index,
    cards,
    presetFor: () => p,
    todayReviews: [],
    rng: seededRng(1),
    ...over,
  };
}

describe('deck tree and preset inheritance', () => {
  it('builds a sorted forest and ignores deleted decks', () => {
    const tree = buildDeckTree([...decks, { ...deck('x', 'Root::X', 'root'), deletedAt: 1 }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((c) => c.deck.id)).toEqual(['a', 'b']);
    expect(tree[0]?.children[0]?.depth).toBe(1);
  });

  it('turns orphans into roots and survives parent cycles', () => {
    const cyc = [deck('p', 'P', 'q'), deck('q', 'Q', 'p'), deck('o', 'O', 'missing')];
    expect(buildDeckTree(cyc).map((n) => n.deck.id)).toEqual(['o']);
    expect(indexDecks(cyc).ancestry('p')).toEqual(['p', 'q']);
  });

  it('computes subtree and ancestry', () => {
    expect(index.subtree('root').sort()).toEqual(['a', 'b', 'root']);
    expect(index.ancestry('a')).toEqual(['a', 'root']);
    expect(index.subtree('nope')).toEqual([]);
  });

  it('inherits the nearest ancestor preset, else the default', () => {
    const presets = new Map([
      ['p1', preset('p1')],
      ['gone', { ...preset('gone'), deletedAt: 5 }],
    ]);
    const dflt = preset('default');
    const idx = indexDecks([
      deck('r', 'R', undefined, 'p1'),
      deck('c', 'R::C', 'r'),
      deck('g', 'R::G', 'r', 'gone'),
      deck('s', 'S'),
    ]);
    expect(resolveDeckPreset('c', idx, presets, dflt).id).toBe('p1');
    expect(resolveDeckPreset('g', idx, presets, dflt).id).toBe('p1');
    expect(resolveDeckPreset('s', idx, presets, dflt).id).toBe('default');
  });
});

describe('hint policy', () => {
  it('applies none / capGood / forceHard', () => {
    expect(applyHintPolicy(4, 1, 'none')).toBe(4);
    expect(applyHintPolicy(4, 1, 'capGood')).toBe(3);
    expect(applyHintPolicy(3, 2, 'capGood')).toBe(3);
    expect(applyHintPolicy(4, 1, 'forceHard')).toBe(2);
    expect(applyHintPolicy(1, 3, 'forceHard')).toBe(1);
    expect(applyHintPolicy(4, 0, 'forceHard')).toBe(4);
  });

  it('maps button counts to ratings', () => {
    expect(ratingsForButtons(2)).toEqual([1, 3]);
    expect(ratingsForButtons(3)).toEqual([1, 3, 4]);
    expect(ratingsForButtons(4)).toEqual([1, 2, 3, 4]);
  });
});

describe('buildQueue', () => {
  it('orders learning, then reviews, then new cards and excludes unavailable cards', () => {
    const l = card({ deckId: 'a', state: 'learning', due: NOW - MINUTE_MS });
    const r = review('a');
    const n = card({ deckId: 'b' });
    const excluded = [
      review('a', NOW, { suspended: true }),
      review('a', NOW, { buriedUntil: NOW + HOUR_MS }),
      review('a', NOW, { deletedAt: 1 }),
      review('a', TODAY_END + 1),
      card({ deckId: 'elsewhere' }),
    ];
    const q = buildQueue(input([n, r, l, ...excluded]));
    expect(q.learning.map((c) => c.id)).toEqual([l.id]);
    expect(q.main.map((c) => c.id)).toEqual([r.id, n.id]);
    expect(q.counts).toEqual({ new: 1, learning: 1, review: 1 });
  });

  it('includes reviews due later today (before rollover) but not tomorrow', () => {
    const later = review('a', TODAY_END - 1);
    const tomorrow = review('a', TODAY_END);
    expect(buildQueue(input([later, tomorrow])).main.map((c) => c.id)).toEqual([later.id]);
  });

  it('applies the new-card limit and counts cards already studied today', () => {
    const p = preset('p', { newPerDay: 3 });
    const cards = Array.from({ length: 10 }, () => card({ deckId: 'a' }));
    const done: TodayReview[] = [
      { cardId: 'x', noteId: 'nx', deckId: 'a', wasNew: true, wasReview: false },
    ];
    const q = buildQueue(input(cards, { presetFor: () => p, todayReviews: done }));
    expect(q.counts.new).toBe(2);
    expect(q.main.map((c) => c.id)).toEqual([cards[0]?.id, cards[1]?.id]);
  });

  it("caps children with the parent's limit (subtree-wide)", () => {
    const parent = preset('parent', { newPerDay: 4, reviewsPerDay: 3 });
    const child = preset('child', { newPerDay: 10, reviewsPerDay: 10 });
    const presetFor = (id: string) => (id === 'root' ? parent : child);
    const cards = [
      ...Array.from({ length: 5 }, () => card({ deckId: 'a' })),
      ...Array.from({ length: 5 }, () => card({ deckId: 'b' })),
      ...Array.from({ length: 5 }, () => review('a')),
    ];
    const q = buildQueue(input(cards, { presetFor }));
    expect(q.counts).toEqual({ new: 4, learning: 0, review: 3 });
    // Studying only the child still respects the parent's cap.
    const qa = buildQueue(input(cards, { presetFor, rootDeckId: 'a' }));
    expect(qa.counts.new).toBe(4);
  });

  it("applies a child's own smaller limit", () => {
    const presetFor = (id: string) =>
      id === 'a' ? preset('small', { newPerDay: 1 }) : preset('big', { newPerDay: 50 });
    const cards = [card({ deckId: 'a' }), card({ deckId: 'a' }), card({ deckId: 'b' })];
    const q = buildQueue(input(cards, { presetFor }));
    expect(q.main.map((c) => c.deckId).sort()).toEqual(['a', 'b']);
  });

  it('ignores limits in custom study', () => {
    const p = preset('p', { newPerDay: 0 });
    const q = buildQueue(
      input([card({ deckId: 'a' })], { presetFor: () => p, ignoreLimits: true }),
    );
    expect(q.counts.new).toBe(1);
  });

  it('buries siblings of new and review cards', () => {
    const n1 = card({ deckId: 'a', noteId: 'same' });
    const n2 = card({ deckId: 'a', noteId: 'same', ord: 1 });
    const r1 = review('a', NOW - 2 * DAY_MS, { noteId: 'rev' });
    const r2 = review('a', NOW - DAY_MS, { noteId: 'rev', ord: 1 });
    const n3 = card({ deckId: 'a', noteId: 'rev', ord: 2 });
    const q = buildQueue(input([n1, n2, r1, r2, n3]));
    expect(q.main.map((c) => c.id)).toEqual([r1.id, n1.id]);
    const noBury = preset('nb', {}, { buryNewSiblings: false, buryReviewSiblings: false });
    expect(buildQueue(input([n1, n2, r1, r2, n3], { presetFor: () => noBury })).main).toHaveLength(
      5,
    );
  });

  it('buries siblings of notes reviewed today', () => {
    const n = card({ deckId: 'a', noteId: 'seen' });
    const done: TodayReview[] = [
      { cardId: 'other', noteId: 'seen', deckId: 'a', wasNew: false, wasReview: true },
    ];
    expect(buildQueue(input([n], { todayReviews: done })).main).toHaveLength(0);
  });

  it('supports new orders and mix modes', () => {
    const cards = [
      card({ deckId: 'b', newPosition: 1 }),
      card({ deckId: 'a', newPosition: 2 }),
      card({ deckId: 'b', newPosition: 3 }),
    ];
    const byDeck = buildQueue(input(cards, { presetFor: () => preset('p', { newOrder: 'deck' }) }));
    expect(byDeck.main.map((c) => c.deckId)).toEqual(['a', 'b', 'b']);
    const random = (seed: number) =>
      buildQueue(
        input(cards, {
          rng: seededRng(seed),
          presetFor: () => preset('p', { newOrder: 'random' }),
        }),
      ).main.map((c) => c.id);
    expect(random(7)).toEqual(random(7));

    const reviews = [review('a'), review('a'), review('a'), review('a')];
    const news = [card({ deckId: 'a' }), card({ deckId: 'a' })];
    const before = buildQueue(
      input([...reviews, ...news], { presetFor: () => preset('p', { mix: 'before' }) }),
    );
    expect(before.main[0]?.state).toBe('new');
    const mixed = buildQueue(
      input([...reviews, ...news], { presetFor: () => preset('p', { mix: 'mixed' }) }),
    );
    expect(mixed.main.map((c) => c.state)).toEqual([
      'review',
      'new',
      'review',
      'review',
      'new',
      'review',
    ]);
  });

  it('handles 100 000 cards quickly', () => {
    const many = Array.from({ length: 100_000 }, (_, i) =>
      i % 2 ? card({ deckId: i % 3 ? 'a' : 'b' }) : review('a', NOW - (i % 50) * HOUR_MS),
    );
    const t0 = performance.now();
    const q = buildQueue(input(many));
    expect(performance.now() - t0).toBeLessThan(1_500);
    expect(q.counts.review).toBe(200);
    expect(q.counts.new).toBe(20);
  });
});

describe('session flow', () => {
  it('serves learning cards first, then main, then waits for later learning cards', () => {
    const l = card({ deckId: 'a', state: 'learning', due: NOW + 30 * MINUTE_MS });
    const r = review('a');
    let q = buildQueue(input([l, r]));
    let next = nextCard(q, NOW, 20);
    expect(next).toMatchObject({ kind: 'card', source: 'main' });
    q = afterAnswer(q, { ...r, due: NOW + 3 * DAY_MS }, TODAY_END);
    expect(nextCard(q, NOW, 20)).toEqual({ kind: 'wait', until: l.due });
    expect(nextCard(q, NOW, 60)).toMatchObject({ kind: 'card', card: { id: l.id } });
    next = nextCard(q, NOW + HOUR_MS, 20);
    expect(next).toMatchObject({ kind: 'card', source: 'learning' });
    q = afterAnswer(q, { ...l, state: 'learning', due: NOW + 2 * HOUR_MS }, TODAY_END);
    expect(q.counts.learning).toBe(1);
    q = afterAnswer(q, { ...l, state: 'review', due: TODAY_END + DAY_MS }, TODAY_END);
    expect(q.counts).toEqual({ new: 0, learning: 0, review: 0 });
    expect(nextCard(q, NOW, 20)).toEqual({ kind: 'done' });
  });

  it('re-inserts a failed review card as relearning and can remove cards', () => {
    const r = review('a');
    let q = buildQueue(input([r, card({ deckId: 'a' })]));
    q = afterAnswer(q, { ...r, state: 'relearning', due: NOW + 10 * MINUTE_MS }, TODAY_END);
    expect(q.counts).toEqual({ new: 1, learning: 1, review: 0 });
    q = removeFromQueue(q, new Set([r.id]));
    expect(q.counts).toEqual({ new: 1, learning: 0, review: 0 });
  });
});

describe('answerCard', () => {
  const stub: AnyScheduler = {
    id: 'stub',
    label: { fr: 'stub', en: 'stub' },
    description: { fr: '', en: '' },
    paramSpec: [],
    defaults: {},
    validate: (p: unknown) => p,
    initCard: ({ now }) => blankMemory(now),
    schedule(memory: CardMemory, rating: Rating, ctx) {
      const lapse = rating === 1 && memory.state === 'review';
      const card: CardMemory = {
        ...memory,
        state: rating === 1 ? 'relearning' : 'review',
        interval: rating === 1 ? 0 : rating,
        due: rating === 1 ? ctx.now + 10 * MINUTE_MS : ctx.startOfDay(rating),
        reps: memory.reps + 1,
        lapses: memory.lapses + (lapse ? 1 : 0),
        lastReview: ctx.now,
      };
      return {
        card,
        log: {
          stateBefore: memory.state,
          stateAfter: card.state,
          intervalBefore: memory.interval,
          intervalAfter: card.interval,
          dueBefore: memory.due,
          dueAfter: card.due,
        },
      };
    },
    preview: () => {
      throw new Error('unused');
    },
    adopt: (m: CardMemory) => m,
  };

  const base = {
    hintsUsed: 0,
    durationMs: 5_000,
    cram: false,
    scheduler: stub,
    now: NOW,
    rng: seededRng(1),
    calendar: cal,
    logId: 'log1',
  };

  it('schedules, logs and applies the hint policy', () => {
    const c = review('a');
    const res = answerCard({ ...base, card: c, rating: 4, hintsUsed: 1, preset: preset('p') });
    expect(res.log.rating).toBe(3);
    expect(res.card.due).toBe(cal.startOf(cal.today(NOW) + 3));
    expect(res.card.updatedAt).toBe(NOW);
    expect(res.log).toMatchObject({
      cardId: c.id,
      stateBefore: 'review',
      stateAfter: 'review',
      hintUsed: 1,
      cram: false,
      algorithm: 'stub',
      presetId: 'p',
    });
  });

  it('caps the recorded duration and stores the answer', () => {
    const res = answerCard({
      ...base,
      card: review('a'),
      rating: 3,
      durationMs: 10 * MINUTE_MS,
      answer: 'x',
      preset: preset('p'),
    });
    expect(res.log.durationMs).toBe(60_000);
    expect(res.log.answer).toBe('x');
  });

  it('does not change the schedule in cram mode', () => {
    const c = review('a');
    const res = answerCard({ ...base, card: c, rating: 1, cram: true, preset: preset('p') });
    expect(res.card).toBe(c);
    expect(res.log.cram).toBe(true);
    expect(res.log.dueAfter).toBe(c.due);
  });

  it('flags leeches and suspends them when configured', () => {
    const c = review('a', NOW, { lapses: 7 });
    const tag = answerCard({ ...base, card: c, rating: 1, preset: preset('p') });
    expect(tag.becameLeech).toBe(true);
    expect(tag.card.leech).toBe(true);
    expect(tag.card.suspended).toBe(false);
    const p = preset('p', {}, { leechAction: 'suspend' });
    expect(answerCard({ ...base, card: c, rating: 1, preset: p }).card.suspended).toBe(true);
    const already = answerCard({ ...base, card: { ...c, leech: true }, rating: 1, preset: p });
    expect(already.becameLeech).toBe(false);
  });
});
