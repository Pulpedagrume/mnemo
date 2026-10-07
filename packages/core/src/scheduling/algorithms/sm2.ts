import { z } from 'zod';
import { blankMemory } from '../../model/card';
import type { CardMemory, Rating } from '../../model/card';
import type { ParamFieldSpec, ParamSpec, Scheduler, SchedulerContext } from '../types';
import {
  adoptedEase,
  clamp,
  dueInDays,
  genericMemory,
  parseParams,
  safeNumber,
  toResult,
  withoutSchedulerData,
} from '../util';

const MIN_EF = 1.3;
const quality = z.number().int().min(0).max(5);

export const Sm2ParamsSchema = z
  .object({
    qualityAgain: quality.default(1),
    qualityHard: quality.default(3),
    qualityGood: quality.default(4),
    qualityEasy: quality.default(5),
    startingEase: z.number().min(MIN_EF).max(5).default(2.5),
    maxInterval: z.number().int().min(1).max(36_500).default(36_500),
  })
  .superRefine((p, ctx) => {
    const ordered =
      p.qualityAgain <= p.qualityHard &&
      p.qualityHard <= p.qualityGood &&
      p.qualityGood <= p.qualityEasy;
    if (!ordered) {
      ctx.addIssue({
        code: 'custom',
        path: ['qualityHard'],
        message: 'qualities must increase from Again to Easy',
      });
    }
  });
export type Sm2Params = z.infer<typeof Sm2ParamsSchema>;

type QualityKey = 'qualityAgain' | 'qualityHard' | 'qualityGood' | 'qualityEasy';

function qualityField(
  key: QualityKey,
  button: { fr: string; en: string },
  def: number,
): ParamFieldSpec<QualityKey> {
  return {
    key,
    kind: 'integer',
    min: 0,
    max: 5,
    advanced: true,
    label: { fr: `Note SM-2 du bouton « ${button.fr} »`, en: `SM-2 grade of ${button.en}` },
    help: {
      fr: `Note de 0 à 5 utilisée par SM-2 quand vous appuyez sur « ${button.fr} ». En dessous de 3, la carte est considérée comme oubliée. Par défaut : ${def}.`,
      en: `Grade from 0 to 5 used by SM-2 when you press ${button.en}. Below 3 the card counts as forgotten. Default: ${def}.`,
    },
  };
}

const SM2_PARAM_SPEC: ParamSpec<Sm2Params> = [
  {
    key: 'startingEase',
    kind: 'number',
    min: MIN_EF,
    max: 5,
    step: 0.05,
    unit: 'multiplier',
    label: { fr: 'Facilité de départ (EF)', en: 'Starting ease (EF)' },
    help: {
      fr: 'Facteur de facilité initial de chaque carte : à partir de la 3ᵉ révision réussie, l’intervalle est multiplié par ce facteur, qui évolue ensuite selon vos notes. Par défaut : 2,5.',
      en: 'Initial easiness factor: from the third successful review on, the interval is multiplied by it; it then changes with your grades. Default: 2.5.',
    },
  },
  {
    key: 'maxInterval',
    kind: 'integer',
    min: 1,
    max: 36_500,
    unit: 'days',
    label: { fr: 'Intervalle maximal', en: 'Maximum interval' },
    help: {
      fr: 'Une carte ne sera jamais programmée plus loin que ce nombre de jours. Par défaut : 36 500 jours (100 ans).',
      en: 'A card is never scheduled further than this many days. Default: 36,500 days (100 years).',
    },
  },
  qualityField('qualityAgain', { fr: 'À revoir', en: 'Again' }, 1),
  qualityField('qualityHard', { fr: 'Difficile', en: 'Hard' }, 3),
  qualityField('qualityGood', { fr: 'Bien', en: 'Good' }, 4),
  qualityField('qualityEasy', { fr: 'Facile', en: 'Easy' }, 5),
];

const QUALITY_KEYS: Record<Rating, QualityKey> = {
  1: 'qualityAgain',
  2: 'qualityHard',
  3: 'qualityGood',
  4: 'qualityEasy',
};

/** EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)), floored at 1.3. */
export function nextEasiness(ef: number, q: number): number {
  const d = 5 - q;
  return Math.max(MIN_EF, ef + (0.1 - d * (0.08 + d * 0.02)));
}

function schedule(card: CardMemory, rating: Rating, ctx: SchedulerContext<Sm2Params>) {
  const p = ctx.params;
  const q = p[QUALITY_KEYS[rating]];
  const ef = card.ease > 0 ? Math.max(MIN_EF, card.ease) : p.startingEase;
  // `step` holds n, the number of consecutive successful repetitions.
  const n = card.state === 'new' ? 0 : card.step;
  let interval: number;
  let nextN: number;
  let lapses = card.lapses;
  if (q < 3) {
    nextN = 0;
    interval = 1;
    if (card.state !== 'new') lapses += 1;
  } else {
    nextN = n + 1;
    if (n === 0) interval = 1;
    else if (n === 1) interval = 6;
    else interval = Math.round(Math.max(1, safeNumber(card.interval, 1)) * ef);
  }
  interval = clamp(interval, 1, p.maxInterval);
  const rest = withoutSchedulerData(card);
  const after: CardMemory = {
    ...rest,
    state: 'review',
    interval,
    due: dueInDays(interval, ctx),
    ease: nextEasiness(ef, q),
    step: nextN,
    reps: card.reps + 1,
    lapses,
    lastReview: ctx.now,
  };
  return toResult(card, after);
}

/** Original SuperMemo-2 algorithm (P. Woźniak, 1987), with a configurable grade table. */
export const sm2Scheduler: Scheduler<Sm2Params> = {
  id: 'sm2',
  label: { fr: 'SuperMemo-2 (SM-2)', en: 'SuperMemo-2 (SM-2)' },
  description: {
    fr: 'L’algorithme historique de SuperMemo : 1 jour, puis 6 jours, puis l’intervalle est multiplié par un facteur de facilité propre à chaque carte. Une réponse ratée fait repartir la carte à 1 jour.',
    en: 'The historic SuperMemo algorithm: 1 day, then 6 days, then the interval is multiplied by a per-card easiness factor. A failed answer sends the card back to 1 day.',
  },
  paramSpec: SM2_PARAM_SPEC,
  defaults: Sm2ParamsSchema.parse({}),
  validate: (params) => parseParams('sm2', Sm2ParamsSchema, params),
  initCard: ({ now }) => blankMemory(now),
  schedule,
  preview(card, ctx) {
    const one = (r: Rating) => {
      const { card: c } = schedule(card, r, ctx);
      return { due: c.due, interval: c.interval };
    };
    return { 1: one(1), 2: one(2), 3: one(3), 4: one(4) };
  },
  adopt(card, ctx) {
    const p = ctx.params;
    if (card.state === 'new') return blankMemory(card.due);
    const base = genericMemory(card);
    const interval = clamp(Math.round(base.interval), 1, p.maxInterval);
    // n: 0 while (re)learning, else 1 for a 1-day interval, 2 above (so the EF applies next).
    const n = card.state === 'review' ? (interval >= 6 ? 2 : 1) : 0;
    return {
      ...base,
      state: 'review',
      interval,
      due: Math.min(base.due, dueInDays(p.maxInterval, ctx)),
      ease: adoptedEase(card, p.startingEase, MIN_EF),
      step: n,
    };
  },
};
