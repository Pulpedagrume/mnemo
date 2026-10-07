/**
 * Isolates ts-fsrs: conversions between CardMemory and ts-fsrs cards, and engine caching.
 * Nothing outside this file imports ts-fsrs scheduling primitives.
 */
import { Rating as FsrsRating, State, fsrs, generatorParameters } from 'ts-fsrs';
import type { CardInput, Card as FsrsCard, FSRS, Grade, StepUnit } from 'ts-fsrs';
import type { CardMemory, CardState, Rating } from '../../model/card';
import { DAY_MS, MINUTE_MS } from '../../time';
import type { SchedulerContext } from '../types';
import {
  clamp,
  difficultyFromEase,
  dueAfter,
  durationsMs,
  elapsedStudyDays,
  safeNumber,
  withoutSchedulerData,
} from '../util';
import type { FsrsParams } from './fsrsParams';

const TO_FSRS: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FROM_FSRS: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

/** ts-fsrs only understands whole minutes/hours/days. */
function toStepUnits(durations: readonly string[]): StepUnit[] {
  return durationsMs(durations).map(
    (ms): StepUnit => `${Math.max(1, Math.round(ms / MINUTE_MS))}m`,
  );
}

const GRADES: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

const engines = new WeakMap<FsrsParams, FSRS>();

/** ts-fsrs engine for a params object (cached by identity: engines are costly to build). */
export function engineFor(p: FsrsParams): FSRS {
  let engine = engines.get(p);
  if (!engine) {
    engine = fsrs(
      generatorParameters({
        request_retention: p.requestRetention,
        maximum_interval: p.maximumInterval,
        enable_fuzz: p.enableFuzz,
        enable_short_term: p.enableShortTerm,
        learning_steps: toStepUnits(p.learningSteps),
        relearning_steps: toStepUnits(p.relearningSteps),
        w: p.w,
      }),
    );
    engines.set(p, engine);
  }
  return engine;
}

/**
 * Memory state estimated from generic fields, for cards coming from another algorithm:
 * stability ≈ current interval (by definition of FSRS at 90 % retention), difficulty from ease.
 */
export function estimateMemoryState(
  card: CardMemory,
  w: readonly number[],
): { stability: number; difficulty: number } {
  const interval = safeNumber(card.interval, 0);
  const initialGood = w[2] ?? 2.3;
  const stability =
    card.state === 'review'
      ? clamp(interval, 0.1, 36_500)
      : clamp(interval, 0.1, Math.max(0.1, initialGood));
  return { stability, difficulty: difficultyFromEase(card.ease) };
}

/**
 * CardMemory → ts-fsrs card. ts-fsrs counts elapsed days in UTC dates; we give it a synthetic
 * last review exactly `n` days before now, where n is the number of elapsed *study* days, so that
 * time zones and the rollover hour are honoured.
 */
export function toFsrsCard(card: CardMemory, ctx: SchedulerContext<FsrsParams>): CardInput {
  let { stability, difficulty } = card;
  if (card.state !== 'new' && (!(stability > 0) || !(difficulty >= 1))) {
    ({ stability, difficulty } = estimateMemoryState(card, ctx.params.w));
  }
  const elapsed = elapsedStudyDays(card.lastReview, ctx);
  return {
    due: card.due,
    stability: card.state === 'new' ? 0 : stability,
    difficulty: card.state === 'new' ? 0 : difficulty,
    elapsed_days: elapsed,
    scheduled_days: card.state === 'review' ? Math.round(safeNumber(card.interval, 0)) : 0,
    learning_steps: card.state === 'learning' || card.state === 'relearning' ? card.step : 0,
    reps: card.reps,
    lapses: card.lapses,
    state: TO_FSRS[card.state],
    last_review:
      card.state === 'new' || card.lastReview === undefined ? null : ctx.now - elapsed * DAY_MS,
  };
}

/** ts-fsrs card → CardMemory. Day-based dues are moved to the start of the study day. */
export function fromFsrsCard(
  before: CardMemory,
  next: FsrsCard,
  ctx: SchedulerContext<FsrsParams>,
): CardMemory {
  const rest = withoutSchedulerData(before);
  const timing = dueAfter(next.due.getTime() - ctx.now, ctx);
  const interval = Math.min(timing.interval, ctx.params.maximumInterval);
  return {
    ...rest,
    state: FROM_FSRS[next.state],
    due: timing.dayBased ? ctx.startOfDay(Math.round(interval)) : timing.due,
    interval,
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    step: next.learning_steps,
    lastReview: ctx.now,
  };
}

export function nextFsrs(
  card: CardMemory,
  rating: Rating,
  ctx: SchedulerContext<FsrsParams>,
): CardMemory {
  const engine = engineFor(ctx.params);
  const item = engine.next(toFsrsCard(card, ctx), ctx.now, GRADES[rating]);
  return fromFsrsCard(card, item.card, ctx);
}
