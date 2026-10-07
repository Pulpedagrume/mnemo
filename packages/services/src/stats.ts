import type { Card, Id, ReviewLog } from '@mnemo/core';
import {
  DAY_MS,
  activityByDay,
  buttonBreakdown,
  dueForecast,
  hintUsage,
  indexDecks,
  intervalHistogram,
  retention,
  stateBreakdown,
  streak,
  toCsv,
  type ButtonCounts,
  type HintUsage,
  type RetentionStats,
  type StateBreakdown,
} from '@mnemo/core';
import type { ServiceContext } from './context';
import { loadCalendar } from './context';

export interface StatsSummary {
  today: number;
  /** Reviews and time per study day over the last 365 days (day index → values). */
  activity: { day: number; reviews: number; durationMs: number }[];
  forecast: number[];
  states: StateBreakdown;
  retention: { week: RetentionStats; month: RetentionStats; year: RetentionStats };
  buttons: Record<'learning' | 'young' | 'mature', ButtonCounts>;
  intervals: { upTo: number | null; count: number }[];
  time: { todayMs: number; weekMs: number; monthMs: number };
  streak: number;
  leeches: { cardId: Id; noteId: Id; lapses: number }[];
  hints: HintUsage;
  totalCards: number;
}

/** Statistics for a deck subtree, or the whole collection when `deckId` is undefined. */
export async function statsSummary(ctx: ServiceContext, deckId?: Id): Promise<StatsSummary> {
  const r = ctx.repo;
  const now = ctx.clock.now();
  const calendar = await loadCalendar(ctx);
  const today = calendar.today(now);
  let cards: Card[];
  if (deckId) {
    const index = indexDecks(await r.decks.list());
    cards = await r.cards.byDeck(index.subtree(deckId));
  } else {
    cards = await r.cards.list();
  }
  const cardIds = new Set(cards.map((c) => c.id));
  const yearStart = calendar.startOf(today - 364);
  const allLogs = await r.reviewLogs.between(yearStart, calendar.startOf(today + 1));
  const logs: ReviewLog[] = deckId ? allLogs.filter((l) => cardIds.has(l.cardId)) : allLogs;
  const activityMap = activityByDay(logs, calendar);
  const since = (days: number) => calendar.startOf(today - days + 1);
  const spent = (from: number) =>
    logs.filter((l) => l.ts >= from).reduce((s, l) => s + l.durationMs, 0);
  return {
    today,
    activity: [...activityMap.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day - b.day),
    forecast: dueForecast(cards, now, calendar, 30),
    states: stateBreakdown(cards),
    retention: {
      week: retention(logs, since(7), now + 1),
      month: retention(logs, since(30), now + 1),
      year: retention(logs, yearStart, now + 1),
    },
    buttons: buttonBreakdown(logs.filter((l) => l.ts >= now - 30 * DAY_MS)),
    intervals: intervalHistogram(cards),
    time: { todayMs: spent(since(1)), weekMs: spent(since(7)), monthMs: spent(since(30)) },
    streak: streak(new Set(activityMap.keys()), today),
    leeches: cards
      .filter((c) => c.leech && c.deletedAt === undefined)
      .map((c) => ({ cardId: c.id, noteId: c.noteId, lapses: c.lapses }))
      .sort((a, b) => b.lapses - a.lapses),
    hints: hintUsage(logs),
    totalCards: cards.filter((c) => c.deletedAt === undefined).length,
  };
}

/** Daily activity as CSV (date, reviews, minutes), dates formatted as YYYY-MM-DD. */
export function activityCsv(summary: StatsSummary): string {
  const date = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  return toCsv([
    ['date', 'reviews', 'minutes'],
    ...summary.activity.map((a) => [date(a.day), a.reviews, Math.round(a.durationMs / 60_000)]),
  ]);
}
