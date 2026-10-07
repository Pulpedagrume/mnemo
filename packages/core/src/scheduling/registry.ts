import type { Locale } from '../i18n';
import type { CardMemory, Rating } from '../model/card';
import type { Rng } from '../rng';
import { formatInterval } from '../time';
import type { StudyCalendar } from '../time';
import { ankiScheduler } from './algorithms/anki';
import { fsrsScheduler } from './algorithms/fsrs';
import { ladderScheduler } from './algorithms/ladder';
import { leitnerScheduler } from './algorithms/leitner';
import { sm2Scheduler } from './algorithms/sm2';
import type { AnyScheduler, Scheduler, SchedulerContext } from './types';

export interface SchedulerRegistry {
  /** Adds or replaces a scheduler (same id replaces). */
  register(scheduler: AnyScheduler): void;
  get(id: string): AnyScheduler | undefined;
  list(): AnyScheduler[];
}

export function createSchedulerRegistry(initial: readonly AnyScheduler[] = []): SchedulerRegistry {
  const byId = new Map<string, AnyScheduler>();
  const registry: SchedulerRegistry = {
    register(scheduler) {
      if (!/^[a-z][a-z0-9_-]{0,49}$/.test(scheduler.id)) {
        throw new Error(
          `Invalid scheduler id "${scheduler.id}": use lowercase letters, digits, "-" or "_"`,
        );
      }
      byId.set(scheduler.id, scheduler);
    },
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
  };
  initial.forEach((s) => {
    registry.register(s);
  });
  return registry;
}

/** The five built-in algorithms, FSRS first (the recommended default). */
export const BUILTIN_SCHEDULERS: readonly AnyScheduler[] = [
  fsrsScheduler,
  ankiScheduler,
  sm2Scheduler,
  leitnerScheduler,
  ladderScheduler,
];

export const defaultSchedulerRegistry: SchedulerRegistry =
  createSchedulerRegistry(BUILTIN_SCHEDULERS);

/** Registers a scheduler in the default registry; the UI picks it up from its paramSpec. */
export function registerScheduler(scheduler: AnyScheduler): void {
  defaultSchedulerRegistry.register(scheduler);
}

/** Scheduler by id from the default registry; throws for an unknown id. */
export function getScheduler(id: string): AnyScheduler {
  const scheduler = defaultSchedulerRegistry.get(id);
  if (!scheduler) {
    const known = defaultSchedulerRegistry
      .list()
      .map((s) => s.id)
      .join(', ');
    throw new Error(`Unknown scheduler "${id}" (known: ${known})`);
  }
  return scheduler;
}

export function listSchedulers(): AnyScheduler[] {
  return defaultSchedulerRegistry.list();
}

/** Builds a SchedulerContext whose day boundaries follow the user's study calendar. */
export function makeSchedulerContext<P>(input: {
  now: number;
  params: P;
  rng: Rng;
  calendar: StudyCalendar;
}): SchedulerContext<P> {
  const { now, params, rng, calendar } = input;
  const today = calendar.today(now);
  return {
    now,
    params,
    rng,
    dayStart: calendar.startOf(today),
    startOfDay: (offset) => calendar.startOf(today + Math.round(offset)),
  };
}

/**
 * Button labels ("10 min", "4 j") for every rating. To show the exact outcome (fuzz included),
 * pass the same freshly seeded rng you will pass to `schedule` (see rngForReview).
 */
export function previewLabels<P>(
  scheduler: Scheduler<P>,
  card: CardMemory,
  ctx: SchedulerContext<P>,
  locale: Locale,
): Record<Rating, string> {
  const preview = scheduler.preview(card, ctx);
  const label = (r: Rating) => formatInterval(Math.max(0, preview[r].due - ctx.now), locale);
  return { 1: label(1), 2: label(2), 3: label(3), 4: label(4) };
}
