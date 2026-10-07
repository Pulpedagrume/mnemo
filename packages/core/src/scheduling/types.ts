import type { I18nString } from '../i18n';
import type { CardMemory, Rating } from '../model/card';
import type { CardState } from '../model/card';
import type { Rng } from '../rng';

export type ParamUnit = 'minutes' | 'days' | 'percent' | 'ratio' | 'multiplier' | 'cards';

interface ParamFieldBase<K extends string> {
  key: K;
  label: I18nString;
  /** Tooltip shown next to the field: what it does and when to change it. */
  help: I18nString;
  /** Hidden behind an "Advanced" toggle in the generated form. */
  advanced?: boolean;
}

/** Describes one parameter; the preset settings form is generated from these. */
export type ParamFieldSpec<K extends string = string> = ParamFieldBase<K> &
  (
    | { kind: 'number'; min: number; max: number; step?: number; unit?: ParamUnit }
    | { kind: 'integer'; min: number; max: number; unit?: ParamUnit }
    | { kind: 'boolean' }
    | { kind: 'enum'; options: readonly { value: string; label: I18nString }[] }
    /** List of durations such as ["10m", "1d", "1w"] (see parseDuration). */
    | { kind: 'durations'; minItems: number; maxItems: number }
    | {
        kind: 'numberList';
        min: number;
        max: number;
        minItems: number;
        maxItems: number;
        unit?: ParamUnit;
      }
  );

export type ParamSpec<P> = readonly ParamFieldSpec<keyof P & string>[];

export interface SchedulerContext<P> {
  /** Current time (epoch ms). */
  now: number;
  params: P;
  /** Deterministic randomness (interval fuzz). */
  rng: Rng;
  /** Start of the current study day (epoch ms), i.e. startOfDay(0). */
  dayStart: number;
  /**
   * Start of the study day `offset` days from today, time-zone and DST aware.
   * Day-based intervals must use it: due = startOfDay(intervalDays).
   */
  startOfDay: (offset: number) => number;
}

/** Fields of a ReviewLog that describe the scheduling change. */
export interface ScheduleLogPatch {
  stateBefore: CardState;
  stateAfter: CardState;
  intervalBefore: number;
  intervalAfter: number;
  dueBefore: number;
  dueAfter: number;
}

export interface ScheduleResult {
  card: CardMemory;
  log: ScheduleLogPatch;
}

export interface RatingPreview {
  due: number;
  /** Interval in days (fractional for learning steps). */
  interval: number;
}

export class ParamValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ParamValidationError';
  }
}

/**
 * A spaced-repetition algorithm. Implementations are pure: same inputs, same outputs.
 * Register new ones with `registerScheduler` — the UI picks them up from `paramSpec`.
 */
export interface Scheduler<P = unknown> {
  id: string;
  label: I18nString;
  description: I18nString;
  paramSpec: ParamSpec<P>;
  defaults: P;
  /** Parses params (filling defaults); throws ParamValidationError with readable issues. */
  validate(params: unknown): P;
  initCard(ctx: { now: number }): CardMemory;
  schedule(card: CardMemory, rating: Rating, ctx: SchedulerContext<P>): ScheduleResult;
  /** Outcome of each rating, for button labels ("< 10 min", "3 j"). */
  preview(card: CardMemory, ctx: SchedulerContext<P>): Record<Rating, RatingPreview>;
  /**
   * Converts a memory produced by another algorithm (state, due, interval, ease, reps, lapses,
   * lastReview are meaningful) into a valid memory for this one. See docs/SCHEDULERS.md.
   */
  adopt(card: CardMemory, ctx: SchedulerContext<P>): CardMemory;
}

// Registries store schedulers with heterogeneous parameter types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- params are validated at runtime via validate()
export type AnyScheduler = Scheduler<any>;
