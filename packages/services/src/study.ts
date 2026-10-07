import type {
  Card,
  DeckNode,
  Id,
  Locale,
  Note,
  NoteType,
  Preset,
  QueueCounts,
  Rating,
  ReviewLog,
  StudyCalendar,
  StudyQueue,
  TodayReview,
} from '@mnemo/core';
import {
  DAY_MS,
  answerCard,
  buildDeckTree,
  buildQueue,
  cardMemory,
  getScheduler,
  indexDecks,
  makeSchedulerContext,
  previewLabels,
  rngForReview,
  shuffled,
} from '@mnemo/core';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';
import { loadCalendar } from './context';
import { resolveNoteType } from './notes';
import { presetResolver } from './presets';

async function todayReviews(
  stores: Stores,
  calendar: StudyCalendar,
  now: number,
): Promise<TodayReview[]> {
  const start = calendar.startOf(calendar.today(now));
  const logs = (
    await stores.reviewLogs.between(start, calendar.startOf(calendar.today(now) + 1))
  ).filter((l) => !l.cram);
  const cards = await stores.cards.getMany([...new Set(logs.map((l) => l.cardId))]);
  const byId = new Map(
    cards.filter((c): c is Card => c !== undefined).map((c) => [c.id, c] as const),
  );
  return logs.flatMap((l) => {
    const card = byId.get(l.cardId);
    return card
      ? [
          {
            cardId: l.cardId,
            noteId: card.noteId,
            deckId: card.deckId,
            wasNew: l.stateBefore === 'new',
            wasReview: l.stateBefore === 'review',
          },
        ]
      : [];
  });
}

export type CustomStudy =
  | { kind: 'cram' }
  | { kind: 'ahead'; days: number }
  | { kind: 'tag'; tag: string }
  | { kind: 'mistakes'; days: number }
  | { kind: 'selection'; cardIds: readonly Id[] };

export interface LoadedQueue {
  queue: StudyQueue;
  /** Reviews in this session do not change the schedule. */
  cram: boolean;
  learnAheadMinutes: number;
  /** End of the current study day: learning cards due before it come back in this session. */
  endOfDay: number;
}

const MAX_CUSTOM = 500;

/** Builds the study queue of a deck subtree, or a custom-study queue. */
export async function loadStudyQueue(
  ctx: ServiceContext,
  deckId: Id,
  custom?: CustomStudy,
): Promise<LoadedQueue> {
  const r = ctx.repo;
  const now = ctx.clock.now();
  const calendar = await loadCalendar(ctx);
  const endOfDay = calendar.startOf(calendar.today(now) + 1);
  const { decks, presetFor } = await presetResolver(ctx);
  const index = indexDecks(decks);
  const deckIds = index.subtree(deckId);
  const rootPreset = presetFor(deckId);
  const learnAheadMinutes = rootPreset.limits.learnAheadMinutes;

  if (!custom) {
    const due = await r.cards.dueBefore(deckIds, endOfDay);
    const fresh = (
      await Promise.all(deckIds.map((id) => r.cards.newCards([id], presetFor(id).limits.newPerDay)))
    ).flat();
    const queue = buildQueue({
      now,
      calendar,
      rootDeckId: deckId,
      decks: index,
      cards: [...due, ...fresh],
      presetFor,
      todayReviews: await todayReviews(r, calendar, now),
      rng: ctx.rng,
    });
    return { queue, cram: false, learnAheadMinutes, endOfDay };
  }

  const live = (c: Card) => !c.suspended && c.deletedAt === undefined;
  let cards: Card[];
  switch (custom.kind) {
    case 'cram':
      cards = shuffled(
        ctx.rng,
        (await r.cards.byDeck(deckIds)).filter((c) => live(c) && c.state !== 'new'),
      );
      break;
    case 'ahead': {
      const until = calendar.startOf(calendar.today(now) + 1 + custom.days);
      cards = (await r.cards.dueBefore(deckIds, until)).filter((c) => c.due >= endOfDay);
      break;
    }
    case 'tag': {
      const notes = (await r.notes.search({ deckIds, tags: [custom.tag] })).notes;
      cards = (await r.cards.byNote(notes.map((n) => n.id))).filter(live);
      break;
    }
    case 'mistakes': {
      const logs = await r.reviewLogs.between(now - custom.days * DAY_MS, now + 1);
      const ids = [...new Set(logs.filter((l) => l.rating === 1).map((l) => l.cardId))];
      const set = new Set(deckIds);
      cards = (await r.cards.getMany(ids)).filter(
        (c): c is Card => !!c && live(c) && set.has(c.deckId),
      );
      break;
    }
    case 'selection':
      cards = (await r.cards.getMany(custom.cardIds)).filter((c): c is Card => !!c && live(c));
      break;
  }
  const main = cards.slice(0, MAX_CUSTOM);
  return {
    queue: {
      learning: [],
      main,
      counts: {
        new: main.filter((c) => c.state === 'new').length,
        learning: 0,
        review: main.filter((c) => c.state !== 'new').length,
      },
    },
    // Studying ahead reschedules; the other custom modes are cram sessions.
    cram: custom.kind !== 'ahead',
    learnAheadMinutes,
    endOfDay,
  };
}

export interface StudyItem {
  card: Card;
  note: Note;
  noteType: NoteType;
  preset: Preset;
  /** Button labels, e.g. { 1: '< 1 min', 3: '4 j' }. */
  labels: Record<Rating, string>;
}

/** Everything needed to display a card: its note, note type, preset and interval labels. */
export async function loadStudyItem(
  ctx: ServiceContext,
  cardId: Id,
  locale: Locale,
): Promise<StudyItem | undefined> {
  const card = await ctx.repo.cards.get(cardId);
  if (!card) return undefined;
  const note = await ctx.repo.notes.get(card.noteId);
  if (!note) return undefined;
  const noteType = await resolveNoteType(ctx.repo, note.noteTypeId);
  const { presetFor } = await presetResolver(ctx);
  const preset = presetFor(card.deckId);
  const scheduler = getScheduler(preset.algorithm);
  const params: unknown = scheduler.validate(preset.params);
  const calendar = await loadCalendar(ctx);
  const sctx = makeSchedulerContext({
    now: ctx.clock.now(),
    params,
    rng: rngForReview(card.id, card.reps),
    calendar,
  });
  return {
    card,
    note,
    noteType,
    preset,
    labels: previewLabels(scheduler, cardMemory(card), sctx, locale),
  };
}

/** What `undoAnswer` needs to restore the state before an answer. */
export interface UndoEntry {
  cardBefore: Card;
  logId: Id;
  noteBefore?: Note;
}

export interface AnswerParams {
  cardId: Id;
  rating: Rating;
  hintsUsed: number;
  durationMs: number;
  answer?: string;
  cram: boolean;
}

/** Records an answer: schedules the card, appends the review log, handles leeches. Atomic. */
export async function answer(
  ctx: ServiceContext,
  params: AnswerParams,
): Promise<{ card: Card; log: ReviewLog; becameLeech: boolean; undo: UndoEntry }> {
  const calendar = await loadCalendar(ctx);
  return ctx.repo.transaction(async (tx) => {
    const card = await tx.cards.get(params.cardId);
    if (!card) throw new Error(`Card ${params.cardId} not found`);
    const { presetFor } = await presetResolver(ctx, tx);
    const preset = presetFor(card.deckId);
    const input = {
      card,
      rating: params.rating,
      hintsUsed: params.hintsUsed,
      durationMs: params.durationMs,
      cram: params.cram,
      preset,
      scheduler: getScheduler(preset.algorithm),
      now: ctx.clock.now(),
      rng: rngForReview(card.id, card.reps),
      calendar,
      logId: ctx.newId(),
    };
    const result = answerCard(
      params.answer === undefined ? input : { ...input, answer: params.answer },
    );
    await tx.cards.put(result.card);
    await tx.reviewLogs.add(result.log);
    const undo: UndoEntry = { cardBefore: card, logId: result.log.id };
    if (result.becameLeech && preset.behavior.leechAction === 'tag') {
      const note = await tx.notes.get(card.noteId);
      if (note && !note.tags.includes('leech')) {
        undo.noteBefore = note;
        await tx.notes.put({ ...note, tags: [...note.tags, 'leech'], updatedAt: input.now });
      }
    }
    return { ...result, undo };
  });
}

/**
 * Restores the card (and note) as they were and deletes the review log. A log carrying sync
 * metadata may already have left the device: it becomes a tombstone (`deletedAt`) so the deletion
 * propagates (docs/SYNC.md); otherwise it is removed.
 */
export async function undoAnswer(ctx: ServiceContext, entry: UndoEntry): Promise<Card> {
  return ctx.repo.transaction(async (tx) => {
    const now = ctx.clock.now();
    const restored = { ...entry.cardBefore, updatedAt: now };
    await tx.cards.put(restored);
    const log = await tx.reviewLogs.get(entry.logId);
    if (log?.sync !== undefined) {
      if (log.deletedAt === undefined) await tx.reviewLogs.add({ ...log, deletedAt: now });
    } else {
      await tx.reviewLogs.remove(entry.logId);
    }
    if (entry.noteBefore) await tx.notes.put({ ...entry.noteBefore, updatedAt: now });
    return restored;
  });
}

/** Hides a card until the next study day. */
export async function buryCard(ctx: ServiceContext, cardId: Id): Promise<void> {
  const calendar = await loadCalendar(ctx);
  const card = await ctx.repo.cards.get(cardId);
  if (!card) return;
  const now = ctx.clock.now();
  await ctx.repo.cards.put({
    ...card,
    buriedUntil: calendar.startOf(calendar.today(now) + 1),
    updatedAt: now,
  });
}

export interface DeckTreeEntry {
  node: DeckNode;
  counts: QueueCounts;
  children: DeckTreeEntry[];
}

/** Deck tree with today's counts (new, learning, review) per deck, limits applied. */
export async function deckTreeWithCounts(ctx: ServiceContext): Promise<DeckTreeEntry[]> {
  const r = ctx.repo;
  const now = ctx.clock.now();
  const calendar = await loadCalendar(ctx);
  const { decks, presetFor } = await presetResolver(ctx);
  const index = indexDecks(decks);
  const allIds = decks.map((d) => d.id);
  const due = allIds.length
    ? await r.cards.dueBefore(allIds, calendar.startOf(calendar.today(now) + 1))
    : [];
  const fresh = (
    await Promise.all(allIds.map((id) => r.cards.newCards([id], presetFor(id).limits.newPerDay)))
  ).flat();
  const cards = [...due, ...fresh];
  const reviews = await todayReviews(r, calendar, now);
  const toEntry = (node: DeckNode): DeckTreeEntry => ({
    node,
    counts: buildQueue({
      now,
      calendar,
      rootDeckId: node.deck.id,
      decks: index,
      cards,
      presetFor,
      todayReviews: reviews,
      rng: ctx.rng,
    }).counts,
    children: node.children.map(toEntry),
  });
  return buildDeckTree(decks).map(toEntry);
}

/** Earliest future due date (learning or review) in a deck subtree, if any. */
export async function nextDueAfterNow(
  ctx: ServiceContext,
  deckId: Id,
): Promise<number | undefined> {
  const now = ctx.clock.now();
  const index = indexDecks(await ctx.repo.decks.list());
  const cards = await ctx.repo.cards.dueBefore(index.subtree(deckId), Number.MAX_SAFE_INTEGER);
  return cards.find((c) => c.due > now)?.due;
}
