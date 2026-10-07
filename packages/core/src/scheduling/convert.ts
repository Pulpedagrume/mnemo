import type { CardMemory } from '../model/card';
import type { StudyCalendar } from '../time';
import type { AnyScheduler, SchedulerContext } from './types';

/**
 * Converts memories from one algorithm to another with `to.adopt` (see docs/SCHEDULERS.md for the
 * mapping). Same algorithm: memories are returned unchanged (copied).
 * `ctx` is the target algorithm's context (its validated params).
 */
export function convertCards(
  cards: readonly CardMemory[],
  from: AnyScheduler,
  to: AnyScheduler,
  ctx: SchedulerContext<unknown>,
): CardMemory[] {
  if (from.id === to.id) return cards.map((c) => ({ ...c }));
  return cards.map((c) => to.adopt(c, ctx));
}

export interface DueForecast {
  /** Cards due by the end of today (overdue included). */
  today: number;
  /** Cards due by the end of tomorrow (cumulative: includes today). */
  tomorrow: number;
  /** Cards due within the 7 study days starting today (cumulative: includes today). */
  next7Days: number;
}

/**
 * Due counts used by the "change algorithm" confirmation screen (before vs after).
 * New cards are not counted: they depend on daily limits, not on the algorithm.
 */
export function forecastDue(
  cards: readonly CardMemory[],
  calendar: StudyCalendar,
  now: number,
): DueForecast {
  const today = calendar.today(now);
  const end1 = calendar.startOf(today + 1);
  const end2 = calendar.startOf(today + 2);
  const end7 = calendar.startOf(today + 7);
  const forecast: DueForecast = { today: 0, tomorrow: 0, next7Days: 0 };
  for (const c of cards) {
    if (c.state === 'new') continue;
    if (c.due < end1) forecast.today++;
    if (c.due < end2) forecast.tomorrow++;
    if (c.due < end7) forecast.next7Days++;
  }
  return forecast;
}
