import type { Card } from '../model/card';
import type { Id } from '../model/common';
import type { Preset } from '../model/preset';
import type { Rng } from '../rng';
import { shuffled } from '../rng';
import type { StudyCalendar } from '../time';
import { MINUTE_MS } from '../time';
import type { DeckIndex } from './deckTree';

/** A review done today, reduced to what limits and sibling burying need. Cram reviews excluded. */
export interface TodayReview {
  cardId: Id;
  noteId: Id;
  deckId: Id;
  /** The card was new before this review (counts toward the new-card limit). */
  wasNew: boolean;
  /** The card was in review state before (counts toward the review limit). */
  wasReview: boolean;
}

export interface QueueInput {
  now: number;
  calendar: StudyCalendar;
  rootDeckId: Id;
  decks: DeckIndex;
  /**
   * Non-deleted cards of the root deck's subtree that could be studied today: learning and review
   * cards due before the end of the study day, plus (enough) new cards. Extra cards are filtered out.
   */
  cards: readonly Card[];
  presetFor: (deckId: Id) => Preset;
  todayReviews: readonly TodayReview[];
  rng: Rng;
  /** Custom study: ignore daily limits (e.g. "study ahead", a browser selection). */
  ignoreLimits?: boolean;
}

export interface QueueCounts {
  new: number;
  learning: number;
  review: number;
}

export interface StudyQueue {
  /** Learning/relearning cards due before the end of the day, sorted by due. */
  learning: Card[];
  /** Review and new cards in presentation order (per the root preset's mix setting). */
  main: Card[];
  counts: QueueCounts;
}

const isLearning = (c: Card) => c.state === 'learning' || c.state === 'relearning';

function studiable(c: Card, now: number): boolean {
  return (
    c.deletedAt === undefined &&
    !c.suspended &&
    (c.buriedUntil === undefined || c.buriedUntil <= now)
  );
}

type LimitKind = 'new' | 'review';

/** Remaining daily quota per deck, shared by each deck's whole subtree. */
function createQuotas(input: QueueInput, kind: LimitKind) {
  const done = new Map<Id, number>();
  for (const r of input.todayReviews) {
    if (kind === 'new' ? !r.wasNew : !r.wasReview) continue;
    for (const a of input.decks.ancestry(r.deckId)) done.set(a, (done.get(a) ?? 0) + 1);
  }
  const remaining = new Map<Id, number>();
  const remainingOf = (deckId: Id) => {
    let value = remaining.get(deckId);
    if (value === undefined) {
      const limits = input.presetFor(deckId).limits;
      const limit = kind === 'new' ? limits.newPerDay : limits.reviewsPerDay;
      value = Math.max(0, limit - (done.get(deckId) ?? 0));
      remaining.set(deckId, value);
    }
    return value;
  };
  return {
    /** Takes one unit from the deck and all its ancestors if all have quota left. */
    tryTake(deckId: Id): boolean {
      if (input.ignoreLimits) return true;
      const chain = input.decks.ancestry(deckId);
      if (chain.some((id) => remainingOf(id) <= 0)) return false;
      for (const id of chain) remaining.set(id, remainingOf(id) - 1);
      return true;
    },
  };
}

function sortNew(cards: Card[], input: QueueInput, order: Preset['limits']['newOrder']): Card[] {
  const byPos = (a: Card, b: Card) =>
    (a.newPosition ?? Number.MAX_SAFE_INTEGER) - (b.newPosition ?? Number.MAX_SAFE_INTEGER) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorted = cards.slice().sort(byPos);
  if (order === 'random') return shuffled(input.rng, sorted);
  if (order === 'deck') {
    const name = (c: Card) => input.decks.byId.get(c.deckId)?.name ?? '';
    return sorted.sort((a, b) => name(a).localeCompare(name(b)) || byPos(a, b));
  }
  return sorted;
}

/** Spreads `b` evenly among `a`. */
function interleave(a: Card[], b: Card[]): Card[] {
  if (a.length === 0) return b.slice();
  if (b.length === 0) return a.slice();
  const out: Card[] = [];
  const step = (a.length + 1) / (b.length + 1);
  let ai = 0;
  for (let bi = 0; bi < b.length; bi++) {
    const until = Math.floor(step * (bi + 1));
    while (ai < until && ai < a.length) out.push(a[ai++] as Card);
    out.push(b[bi] as Card);
  }
  while (ai < a.length) out.push(a[ai++] as Card);
  return out;
}

/**
 * Builds today's study queue for a deck subtree. Pure: same input (including rng seed), same queue.
 * Order: learning cards due soonest, then review and new cards mixed per the root preset.
 * Daily limits of each deck apply to its whole subtree (a parent's limit caps all its children).
 */
export function buildQueue(input: QueueInput): StudyQueue {
  const { now, calendar } = input;
  const endOfDay = calendar.startOf(calendar.today(now) + 1);
  const subtree = new Set(input.decks.subtree(input.rootDeckId));
  const rootPreset = input.presetFor(input.rootDeckId);
  const candidates = input.cards.filter((c) => subtree.has(c.deckId) && studiable(c, now));

  const touchedNotes = new Set(input.todayReviews.map((r) => r.noteId));
  const learning = candidates
    .filter((c) => isLearning(c) && c.due < endOfDay)
    .sort((a, b) => a.due - b.due || (a.id < b.id ? -1 : 1));
  for (const c of learning) touchedNotes.add(c.noteId);

  const reviewQuota = createQuotas(input, 'review');
  const reviews: Card[] = [];
  const reviewNotes = new Set<Id>();
  const dueReviews = candidates
    .filter((c) => c.state === 'review' && c.due < endOfDay)
    .sort((a, b) => a.due - b.due || (a.id < b.id ? -1 : 1));
  for (const c of dueReviews) {
    const bury = input.presetFor(c.deckId).behavior.buryReviewSiblings;
    if (bury && (reviewNotes.has(c.noteId) || touchedNotes.has(c.noteId))) continue;
    if (!reviewQuota.tryTake(c.deckId)) continue;
    reviews.push(c);
    reviewNotes.add(c.noteId);
  }

  const newQuota = createQuotas(input, 'new');
  const newCards: Card[] = [];
  const newNotes = new Set<Id>();
  const allNew = sortNew(
    candidates.filter((c) => c.state === 'new'),
    input,
    rootPreset.limits.newOrder,
  );
  for (const c of allNew) {
    const bury = input.presetFor(c.deckId).behavior.buryNewSiblings;
    if (bury && (newNotes.has(c.noteId) || touchedNotes.has(c.noteId) || reviewNotes.has(c.noteId)))
      continue;
    if (!newQuota.tryTake(c.deckId)) continue;
    newCards.push(c);
    newNotes.add(c.noteId);
  }

  const mix = rootPreset.limits.mix;
  const main =
    mix === 'before'
      ? [...newCards, ...reviews]
      : mix === 'mixed'
        ? interleave(reviews, newCards)
        : [...reviews, ...newCards];

  return {
    learning,
    main,
    counts: { new: newCards.length, learning: learning.length, review: reviews.length },
  };
}

export type NextCard =
  | { kind: 'card'; card: Card; source: 'learning' | 'main' }
  /** Only learning cards remain, due later today. */
  | { kind: 'wait'; until: number }
  | { kind: 'done' };

/**
 * Chooses the next card: a learning card due now (or within learn-ahead) first, then the main
 * queue. When only later learning cards remain, returns the time to come back.
 */
export function nextCard(queue: StudyQueue, now: number, learnAheadMinutes: number): NextCard {
  const first = queue.learning[0];
  if (first && first.due <= now) return { kind: 'card', card: first, source: 'learning' };
  const main = queue.main[0];
  if (main) return { kind: 'card', card: main, source: 'main' };
  if (first && first.due <= now + learnAheadMinutes * MINUTE_MS)
    return { kind: 'card', card: first, source: 'learning' };
  if (first) return { kind: 'wait', until: first.due };
  return { kind: 'done' };
}

/**
 * Updates the queue after a card was answered: removes it, and re-inserts its new version into the
 * learning list when it is due again before the end of the study day.
 */
export function afterAnswer(queue: StudyQueue, updated: Card, endOfDay: number): StudyQueue {
  const wasLearning = queue.learning.some((c) => c.id === updated.id);
  const wasMain = queue.main.find((c) => c.id === updated.id);
  const learning = queue.learning.filter((c) => c.id !== updated.id);
  const main = queue.main.filter((c) => c.id !== updated.id);
  const counts = { ...queue.counts };
  if (wasLearning) counts.learning--;
  else if (wasMain) counts[wasMain.state === 'new' ? 'new' : 'review']--;
  if (updated.due < endOfDay && updated.state !== 'review' && updated.state !== 'new') {
    learning.push(updated);
    learning.sort((a, b) => a.due - b.due || (a.id < b.id ? -1 : 1));
    counts.learning++;
  }
  return { learning, main, counts };
}

/** Removes cards (buried, suspended, deleted, edited away) from a queue. */
export function removeFromQueue(queue: StudyQueue, cardIds: ReadonlySet<Id>): StudyQueue {
  const learning = queue.learning.filter((c) => !cardIds.has(c.id));
  const main = queue.main.filter((c) => !cardIds.has(c.id));
  return {
    learning,
    main,
    counts: {
      learning: learning.length,
      new: main.filter((c) => c.state === 'new').length,
      review: main.filter((c) => c.state !== 'new').length,
    },
  };
}
