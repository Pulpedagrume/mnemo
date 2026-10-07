import { blankMemory } from '../../model/card';
import type { CardMemory, Rating } from '../../model/card';
import type { Scheduler } from '../types';
import {
  clamp,
  closestIndex,
  dueInDays,
  durationsMs,
  genericMemory,
  parseParams,
  toResult,
} from '../util';
import { DAY_MS } from '../../time';
import { estimateMemoryState, nextFsrs } from './fsrsAdapter';
import { FSRS_PARAM_SPEC, FsrsParamsSchema } from './fsrsParams';
import type { FsrsParams } from './fsrsParams';

export type { FsrsParams } from './fsrsParams';
export { FSRS_DEFAULT_WEIGHTS } from './fsrsParams';

/**
 * FSRS-6 through ts-fsrs. Fuzz is seeded by ts-fsrs itself from the review time, the review count
 * and the memory state, so the result is deterministic for identical inputs (ctx.rng is unused).
 */
export const fsrsScheduler: Scheduler<FsrsParams> = {
  id: 'fsrs',
  label: { fr: 'FSRS (recommandé)', en: 'FSRS (recommended)' },
  description: {
    fr: 'Algorithme moderne qui modélise votre mémoire carte par carte (stabilité et difficulté) et programme chaque révision au moment où vous avez environ 90 % de chances de vous en souvenir. Moins de révisions pour la même rétention.',
    en: 'Modern algorithm that models your memory card by card (stability and difficulty) and schedules each review when you have about a 90% chance of remembering. Fewer reviews for the same retention.',
  },
  paramSpec: FSRS_PARAM_SPEC,
  defaults: FsrsParamsSchema.parse({}),
  validate: (params) => parseParams('fsrs', FsrsParamsSchema, params),
  initCard: ({ now }) => blankMemory(now),
  schedule(card, rating, ctx) {
    return toResult(card, nextFsrs(card, rating, ctx));
  },
  preview(card, ctx) {
    const one = (r: Rating) => {
      const c = nextFsrs(card, r, ctx);
      return { due: c.due, interval: c.interval };
    };
    return { 1: one(1), 2: one(2), 3: one(3), 4: one(4) };
  },
  adopt(card, ctx) {
    const p = ctx.params;
    if (card.state === 'new') return blankMemory(card.due);
    const base = genericMemory(card);
    const { stability, difficulty } = estimateMemoryState(card, p.w);
    if (card.state === 'review') {
      const interval = clamp(Math.round(base.interval), 1, p.maximumInterval);
      const due = Math.min(base.due, dueInDays(p.maximumInterval, ctx));
      return { ...base, interval, due, stability, difficulty };
    }
    const steps = durationsMs(card.state === 'learning' ? p.learningSteps : p.relearningSteps);
    const step = steps.length ? closestIndex(steps, base.interval * DAY_MS) : 0;
    const adopted: CardMemory = { ...base, step, stability, difficulty };
    return adopted;
  },
};
