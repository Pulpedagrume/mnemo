import type { Card, CardState, Rating } from '../model/card';
import type { ReviewLog } from '../model/reviewLog';
import type { StudyCalendar } from '../time';

/** Reviews per study day, for the activity heatmap. Keys are day indexes. */
export function activityByDay(
  logs: readonly ReviewLog[],
  calendar: StudyCalendar,
): Map<number, { reviews: number; durationMs: number }> {
  const out = new Map<number, { reviews: number; durationMs: number }>();
  for (const log of logs) {
    const day = calendar.today(log.ts);
    const cur = out.get(day) ?? { reviews: 0, durationMs: 0 };
    cur.reviews++;
    cur.durationMs += log.durationMs;
    out.set(day, cur);
  }
  return out;
}

/**
 * Cards due on each of the next `days` study days (index 0 = today, including overdue cards).
 * New and suspended cards are excluded.
 */
export function dueForecast(
  cards: readonly Card[],
  now: number,
  calendar: StudyCalendar,
  days = 30,
): number[] {
  const today = calendar.today(now);
  const out = new Array<number>(days).fill(0);
  for (const c of cards) {
    if (c.state === 'new' || c.suspended || c.deletedAt !== undefined) continue;
    const offset = Math.max(0, calendar.today(c.due) - today);
    if (offset < days) out[offset] = (out[offset] ?? 0) + 1;
  }
  return out;
}

export interface StateBreakdown extends Record<CardState, number> {
  suspended: number;
  leech: number;
  /** Review cards with an interval of 21 days or more. */
  mature: number;
}

export function stateBreakdown(cards: readonly Card[]): StateBreakdown {
  const out: StateBreakdown = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    suspended: 0,
    leech: 0,
    mature: 0,
  };
  for (const c of cards) {
    if (c.deletedAt !== undefined) continue;
    if (c.suspended) out.suspended++;
    else out[c.state]++;
    if (c.leech) out.leech++;
    if (c.state === 'review' && c.interval >= 21) out.mature++;
  }
  return out;
}

export interface RetentionStats {
  /** Reviews of cards that were in review state (cram excluded). */
  total: number;
  passed: number;
  /** passed / total, or null when there is no data. */
  rate: number | null;
}

/** True retention: share of review-state cards answered Hard/Good/Easy, over [from, to). */
export function retention(logs: readonly ReviewLog[], from: number, to: number): RetentionStats {
  let total = 0;
  let passed = 0;
  for (const log of logs) {
    if (log.cram || log.ts < from || log.ts >= to || log.stateBefore !== 'review') continue;
    total++;
    if (log.rating > 1) passed++;
  }
  return { total, passed, rate: total === 0 ? null : passed / total };
}

export type ButtonCounts = Record<Rating, number>;

/** Rating distribution split by the card's state before the review. */
export function buttonBreakdown(
  logs: readonly ReviewLog[],
): Record<'learning' | 'young' | 'mature', ButtonCounts> {
  const blank = (): ButtonCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const out = { learning: blank(), young: blank(), mature: blank() };
  for (const log of logs) {
    if (log.cram) continue;
    const bucket =
      log.stateBefore === 'review' ? (log.intervalBefore >= 21 ? 'mature' : 'young') : 'learning';
    out[bucket][log.rating]++;
  }
  return out;
}

/** Histogram of review intervals (days) with the given upper bounds; last bucket is open-ended. */
export function intervalHistogram(
  cards: readonly Card[],
  bounds: readonly number[] = [1, 3, 7, 14, 30, 90, 180, 365],
): { upTo: number | null; count: number }[] {
  const out = [...bounds.map((b) => ({ upTo: b, count: 0 })), { upTo: null, count: 0 }];
  for (const c of cards) {
    if (c.state !== 'review' || c.deletedAt !== undefined) continue;
    const i = bounds.findIndex((b) => c.interval <= b);
    const bucket = out[i === -1 ? bounds.length : i];
    if (bucket) bucket.count++;
  }
  return out;
}

/** Consecutive study days ending today (or yesterday if nothing was studied yet today). */
export function streak(activityDays: ReadonlySet<number>, today: number): number {
  let day = activityDays.has(today) ? today : today - 1;
  let count = 0;
  while (activityDays.has(day)) {
    count++;
    day--;
  }
  return count;
}

export interface HintUsage {
  reviews: number;
  withHint: number;
  hintsOpened: number;
  /** Retention of review-state cards when a hint was used vs not. */
  passRateWithHint: number | null;
  passRateWithoutHint: number | null;
}

export function hintUsage(logs: readonly ReviewLog[]): HintUsage {
  let reviews = 0;
  let withHint = 0;
  let hintsOpened = 0;
  const pass = { with: [0, 0], without: [0, 0] };
  for (const log of logs) {
    if (log.cram) continue;
    reviews++;
    hintsOpened += log.hintUsed;
    const key = log.hintUsed > 0 ? 'with' : 'without';
    if (log.hintUsed > 0) withHint++;
    if (log.stateBefore === 'review') {
      pass[key][1] = (pass[key][1] ?? 0) + 1;
      if (log.rating > 1) pass[key][0] = (pass[key][0] ?? 0) + 1;
    }
  }
  const rate = ([ok, n]: number[]) => (n ? (ok ?? 0) / n : null);
  return {
    reviews,
    withHint,
    hintsOpened,
    passRateWithHint: rate(pass.with),
    passRateWithoutHint: rate(pass.without),
  };
}

/** Summary of a finished study session. */
export interface SessionSummary {
  reviewed: number;
  passed: number;
  /** Share of answers other than Again, or null. */
  successRate: number | null;
  durationMs: number;
  hintsUsed: number;
}

export function summarizeSession(logs: readonly ReviewLog[]): SessionSummary {
  const passed = logs.filter((l) => l.rating > 1).length;
  return {
    reviewed: logs.length,
    passed,
    successRate: logs.length ? passed / logs.length : null,
    durationMs: logs.reduce((s, l) => s + l.durationMs, 0),
    hintsUsed: logs.reduce((s, l) => s + l.hintUsed, 0),
  };
}

/** Rows for CSV export of daily activity: day index → ISO date is formatted by the caller. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
