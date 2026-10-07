import { z } from 'zod';
import type { ParamSpec } from '../types';

export const AnkiParamsSchema = z
  .object({
    learningSteps: z.array(z.number().min(0.5).max(43_200)).max(20).default([1, 10]),
    graduatingInterval: z.number().int().min(1).max(365).default(1),
    easyInterval: z.number().int().min(1).max(365).default(4),
    relearningSteps: z.array(z.number().min(0.5).max(43_200)).max(20).default([10]),
    lapseNewIntervalPct: z.number().min(0).max(100).default(0),
    minLapseInterval: z.number().int().min(1).max(365).default(1),
    startingEase: z.number().min(1.3).max(5).default(2.5),
    easyBonus: z.number().min(1).max(5).default(1.3),
    hardInterval: z.number().min(0.5).max(3).default(1.2),
    intervalModifier: z.number().min(0.1).max(5).default(1),
    maxInterval: z.number().int().min(1).max(36_500).default(36_500),
    minEase: z.number().min(1).max(3).default(1.3),
    easeAgain: z.number().min(-1).max(0).default(-0.2),
    easeHard: z.number().min(-1).max(0).default(-0.15),
    easeEasy: z.number().min(0).max(1).default(0.15),
    fuzz: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.easyInterval < p.graduatingInterval) {
      ctx.addIssue({
        code: 'custom',
        path: ['easyInterval'],
        message: 'must be greater than or equal to graduatingInterval',
      });
    }
    if (p.startingEase < p.minEase) {
      ctx.addIssue({
        code: 'custom',
        path: ['startingEase'],
        message: 'must be greater than or equal to minEase',
      });
    }
  });

export type AnkiParams = z.infer<typeof AnkiParamsSchema>;

export const ANKI_PARAM_SPEC: ParamSpec<AnkiParams> = [
  {
    key: 'learningSteps',
    kind: 'numberList',
    min: 0.5,
    max: 43_200,
    minItems: 0,
    maxItems: 20,
    unit: 'minutes',
    label: { fr: 'Étapes d’apprentissage', en: 'Learning steps' },
    help: {
      fr: 'Délais (en minutes) entre les premières présentations d’une carte nouvelle. « Bien » passe à l’étape suivante ; après la dernière, la carte devient « à réviser ». Par défaut : 1 puis 10 minutes.',
      en: 'Delays (minutes) between the first showings of a new card. Good moves to the next step; after the last one the card graduates. Default: 1 then 10 minutes.',
    },
  },
  {
    key: 'graduatingInterval',
    kind: 'integer',
    min: 1,
    max: 365,
    unit: 'days',
    label: { fr: 'Intervalle de sortie', en: 'Graduating interval' },
    help: {
      fr: 'Nombre de jours avant la première révision quand une carte termine ses étapes avec « Bien ». Par défaut : 1 jour.',
      en: 'Days until the first review when a card finishes its steps with Good. Default: 1 day.',
    },
  },
  {
    key: 'easyInterval',
    kind: 'integer',
    min: 1,
    max: 365,
    unit: 'days',
    label: { fr: 'Intervalle « Facile »', en: 'Easy interval' },
    help: {
      fr: 'Nombre de jours avant la première révision quand vous répondez « Facile » pendant l’apprentissage (la carte saute les étapes restantes). Par défaut : 4 jours.',
      en: 'Days until the first review when you answer Easy during learning (remaining steps are skipped). Default: 4 days.',
    },
  },
  {
    key: 'relearningSteps',
    kind: 'numberList',
    min: 0.5,
    max: 43_200,
    minItems: 0,
    maxItems: 20,
    unit: 'minutes',
    label: { fr: 'Étapes de réapprentissage', en: 'Relearning steps' },
    help: {
      fr: 'Délais (en minutes) pour revoir une carte oubliée (« À revoir ») avant qu’elle reparte en révision. Par défaut : 10 minutes.',
      en: 'Delays (minutes) to see a forgotten card again (Again) before it goes back to reviews. Default: 10 minutes.',
    },
  },
  {
    key: 'lapseNewIntervalPct',
    kind: 'number',
    min: 0,
    max: 100,
    step: 5,
    unit: 'percent',
    label: { fr: 'Nouvel intervalle après un oubli', en: 'New interval after a lapse' },
    help: {
      fr: 'Pourcentage de l’ancien intervalle conservé quand vous oubliez une carte. 0 % = on repart de l’intervalle minimal ; 50 % = on garde la moitié. Par défaut : 0 %.',
      en: 'Share of the previous interval kept when you forget a card. 0% restarts from the minimum interval; 50% keeps half. Default: 0%.',
    },
  },
  {
    key: 'minLapseInterval',
    kind: 'integer',
    min: 1,
    max: 365,
    unit: 'days',
    label: { fr: 'Intervalle minimal après un oubli', en: 'Minimum interval after a lapse' },
    help: {
      fr: 'Nombre de jours minimum avant de revoir une carte oubliée, une fois le réapprentissage terminé. Par défaut : 1 jour.',
      en: 'Minimum days before seeing a forgotten card again once relearning is done. Default: 1 day.',
    },
  },
  {
    key: 'startingEase',
    kind: 'number',
    min: 1.3,
    max: 5,
    step: 0.05,
    unit: 'multiplier',
    label: { fr: 'Facilité de départ', en: 'Starting ease' },
    help: {
      fr: 'Multiplicateur appliqué à l’intervalle à chaque « Bien » pour une carte qui vient d’être apprise (2,5 = l’intervalle est multiplié par 2,5). Il évolue ensuite selon vos réponses.',
      en: 'Multiplier applied to the interval on each Good for a newly learned card (2.5 multiplies the interval by 2.5). It then changes with your answers.',
    },
  },
  {
    key: 'easyBonus',
    kind: 'number',
    min: 1,
    max: 5,
    step: 0.05,
    unit: 'multiplier',
    label: { fr: 'Bonus « Facile »', en: 'Easy bonus' },
    help: {
      fr: 'Multiplicateur supplémentaire quand vous répondez « Facile » en révision : l’intervalle « Bien » est multiplié par cette valeur. Par défaut : 1,3.',
      en: 'Extra multiplier when you answer Easy on a review: the Good interval is multiplied by this value. Default: 1.3.',
    },
  },
  {
    key: 'hardInterval',
    kind: 'number',
    min: 0.5,
    max: 3,
    step: 0.05,
    unit: 'multiplier',
    label: { fr: 'Multiplicateur « Difficile »', en: 'Hard interval' },
    help: {
      fr: 'Multiplicateur de l’intervalle quand vous répondez « Difficile » en révision. 1,2 = l’intervalle grandit un peu (20 %). Par défaut : 1,2.',
      en: 'Interval multiplier when you answer Hard on a review. 1.2 grows the interval a little (20%). Default: 1.2.',
    },
  },
  {
    key: 'intervalModifier',
    kind: 'number',
    min: 0.1,
    max: 5,
    step: 0.05,
    unit: 'multiplier',
    label: { fr: 'Modificateur d’intervalle', en: 'Interval modifier' },
    help: {
      fr: 'Multiplie tous les intervalles de révision. Moins de 1 = révisions plus fréquentes et meilleure rétention ; plus de 1 = moins de travail mais plus d’oublis. Par défaut : 1.',
      en: 'Multiplies every review interval. Below 1 means more frequent reviews and better retention; above 1 means less work but more forgetting. Default: 1.',
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
      fr: 'Une carte ne sera jamais programmée plus loin que ce nombre de jours. Réduisez-le pour un examen proche (ex. 30). Par défaut : 36 500 jours (100 ans).',
      en: 'A card is never scheduled further than this many days. Lower it for an upcoming exam (e.g. 30). Default: 36,500 days (100 years).',
    },
  },
  {
    key: 'fuzz',
    kind: 'boolean',
    label: { fr: 'Variation aléatoire', en: 'Fuzz' },
    help: {
      fr: 'Décale légèrement les intervalles (± 5 % environ) pour éviter que les cartes apprises le même jour reviennent toutes ensemble. Recommandé.',
      en: 'Slightly shifts intervals (about ±5%) so cards learned on the same day do not all come back together. Recommended.',
    },
  },
  {
    key: 'minEase',
    kind: 'number',
    min: 1,
    max: 3,
    step: 0.05,
    unit: 'multiplier',
    advanced: true,
    label: { fr: 'Facilité minimale', en: 'Minimum ease' },
    help: {
      fr: 'La facilité d’une carte ne descend jamais sous cette valeur, même après de nombreux oublis. Par défaut : 1,3.',
      en: 'A card’s ease never goes below this value, even after many lapses. Default: 1.3.',
    },
  },
  {
    key: 'easeAgain',
    kind: 'number',
    min: -1,
    max: 0,
    step: 0.05,
    advanced: true,
    label: { fr: 'Variation de facilité « À revoir »', en: 'Ease change on Again' },
    help: {
      fr: 'Ajouté à la facilité quand vous oubliez une carte en révision. Par défaut : −0,20.',
      en: 'Added to the ease when you forget a review card. Default: −0.20.',
    },
  },
  {
    key: 'easeHard',
    kind: 'number',
    min: -1,
    max: 0,
    step: 0.05,
    advanced: true,
    label: { fr: 'Variation de facilité « Difficile »', en: 'Ease change on Hard' },
    help: {
      fr: 'Ajouté à la facilité quand vous répondez « Difficile » en révision. Par défaut : −0,15.',
      en: 'Added to the ease when you answer Hard on a review. Default: −0.15.',
    },
  },
  {
    key: 'easeEasy',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    advanced: true,
    label: { fr: 'Variation de facilité « Facile »', en: 'Ease change on Easy' },
    help: {
      fr: 'Ajouté à la facilité quand vous répondez « Facile » en révision. Par défaut : +0,15.',
      en: 'Added to the ease when you answer Easy on a review. Default: +0.15.',
    },
  },
];
