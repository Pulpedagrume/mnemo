import type { CardMemory, Rating } from '../model/card';
import { seededRng } from '../rng';
import { DAY_MS, HOUR_MS, SECOND_MS } from '../time';
import type { StudyCalendar } from '../time';
import { getScheduler, makeSchedulerContext } from './registry';
import type { AnyScheduler } from './types';

/** UTC study calendar with a midnight rollover, computed arithmetically (fast, for simulations). */
export const utcStudyCalendar: StudyCalendar = {
  timeZone: 'UTC',
  rolloverHour: 0,
  today: (now) => Math.floor(now / DAY_MS),
  startOf: (index) => index * DAY_MS,
};

export interface SimulationInput {
  /** Scheduler object or id from the default registry. */
  scheduler: AnyScheduler | string;
  /** Raw parameters, validated (and completed with defaults) by the scheduler. */
  params?: unknown;
  /** Number of simulated days (the UI offers 30–365). */
  days: number;
  newPerDay: number;
  /** Cap on due reviews started per day (same-day learning repeats are not capped). */
  reviewsPerDay?: number;
  /** Total number of new cards that can be introduced (default: unlimited). */
  newCardsAvailable?: number;
  /** Probability of recalling a card on each review (0–1). */
  retention: number;
  seed: number;
  secondsPerReview?: number;
  secondsPerNew?: number;
  /** Existing memories (valid for the scheduler); new ones are introduced first. */
  startCards?: readonly CardMemory[];
  /** Simulation start (epoch ms). Defaults to 2026-01-01 UTC so results do not depend on "now". */
  startTime?: number;
}

export interface SimulationDay {
  day: number;
  /** Reviews of already-seen cards, including same-day learning repeats. */
  reviews: number;
  newCards: number;
  minutes: number;
  /** Review cards forgotten that day. */
  lapses: number;
}

export interface SimulationResult {
  days: SimulationDay[];
  totalReviews: number;
  avgReviewsPerDay: number;
  seed: number;
}

const DEFAULT_START = Date.UTC(2026, 0, 1);
const SESSION_HOUR = 9;
/** Safety net against learning loops inside a day. */
const MAX_SAME_DAY_PASSES = 30;

function checkInput(input: SimulationInput): void {
  const intOk = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  if (!intOk(input.days, 1, 3_650)) throw new RangeError('days must be an integer in [1, 3650]');
  if (!intOk(input.newPerDay, 0, 9_999)) throw new RangeError('newPerDay must be in [0, 9999]');
  if (!(input.retention >= 0 && input.retention <= 1)) {
    throw new RangeError('retention must be in [0, 1]');
  }
}

/**
 * Simulates the daily workload of a scheduler with a synthetic user who recalls each card with
 * probability `retention` (Good) and otherwise forgets it (Again). Pure and deterministic.
 */
export function simulateWorkload(input: SimulationInput): SimulationResult {
  checkInput(input);
  const scheduler =
    typeof input.scheduler === 'string' ? getScheduler(input.scheduler) : input.scheduler;
  const params: unknown = scheduler.validate(input.params ?? {});
  const userRng = seededRng(input.seed);
  const schedulerRng = seededRng(input.seed ^ 0x5bd1e995);
  const reviewCap = input.reviewsPerDay ?? Number.POSITIVE_INFINITY;
  const secReview = (input.secondsPerReview ?? 8) * SECOND_MS;
  const secNew = (input.secondsPerNew ?? 20) * SECOND_MS;
  const cal = utcStudyCalendar;
  const firstDay = cal.today(input.startTime ?? DEFAULT_START);

  const cards: CardMemory[] = (input.startCards ?? []).map((c) => ({ ...c }));
  const newQueue = cards.flatMap((c, i) => (c.state === 'new' ? [i] : []));
  let newLeft = input.newCardsAvailable ?? Number.POSITIVE_INFINITY;
  const out: SimulationDay[] = [];

  for (let d = 0; d < input.days; d++) {
    const dayEnd = cal.startOf(firstDay + d + 1);
    let now = cal.startOf(firstDay + d) + SESSION_HOUR * HOUR_MS;
    const stats: SimulationDay = { day: d, reviews: 0, newCards: 0, minutes: 0, lapses: 0 };
    const touched = new Set<number>();

    const rate = (i: number, cost: number) => {
      const card = cards[i];
      if (!card) return;
      const recalled = userRng.next() < input.retention;
      const rating: Rating = recalled ? 3 : 1;
      if (!recalled && card.state === 'review') stats.lapses++;
      const ctx = makeSchedulerContext({ now, params, rng: schedulerRng, calendar: cal });
      cards[i] = scheduler.schedule(card, rating, ctx).card;
      touched.add(i);
      now += cost;
    };

    const due = cards
      .flatMap((c, i) => (c.state !== 'new' && c.due < dayEnd ? [i] : []))
      .sort((a, b) => (cards[a]?.due ?? 0) - (cards[b]?.due ?? 0));
    for (const i of due.slice(0, Number.isFinite(reviewCap) ? reviewCap : due.length)) {
      rate(i, secReview);
      stats.reviews++;
    }

    for (let n = 0; n < input.newPerDay; n++) {
      let i = newQueue.shift();
      if (i === undefined) {
        if (newLeft <= 0) break;
        newLeft--;
        i = cards.push(scheduler.initCard({ now })) - 1;
      }
      rate(i, secNew);
      stats.newCards++;
    }

    // Same-day (re)learning steps.
    for (let pass = 0; pass < MAX_SAME_DAY_PASSES; pass++) {
      const again = [...touched]
        .filter((i) => {
          const c = cards[i];
          return c !== undefined && c.state !== 'new' && c.due < dayEnd;
        })
        .sort((a, b) => (cards[a]?.due ?? 0) - (cards[b]?.due ?? 0));
      if (again.length === 0) break;
      for (const i of again) {
        now = Math.max(now, cards[i]?.due ?? now);
        rate(i, secReview);
        stats.reviews++;
      }
    }

    stats.minutes =
      Math.round(((stats.reviews * secReview + stats.newCards * secNew) / 60_000) * 10) / 10;
    out.push(stats);
  }

  const totalReviews = out.reduce((sum, day) => sum + day.reviews, 0);
  return {
    days: out,
    totalReviews,
    avgReviewsPerDay: Math.round((totalReviews / out.length) * 10) / 10,
    seed: input.seed,
  };
}
