import type { I18nString, Locale } from '@mnemo/core';

export const LEVELS = ['debutant', 'intermediaire', 'expert'] as const;
export type Level = (typeof LEVELS)[number];

export const DENSITIES = [3, 5, 10, 'exhaustif'] as const;
export type Density = (typeof DENSITIES)[number];

export const DOCUMENT_TYPES = ['cours', 'diapositives', 'article', 'manuel', 'td', 'corrige'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Wizard options (step 3). Every field is optional; see DEFAULT_PROMPT_OPTIONS. */
export interface PromptOptions {
  /** Root deck. */
  deck?: string;
  /** Language of the cards: a name ("français") or a BCP-47 code ("fr", "en-GB"). */
  language?: string;
  level?: Level;
  density?: Density;
  hints?: boolean;
  explanations?: boolean;
  /** Number of MCQ choices, 3 to 6 (clamped). */
  mcqChoices?: number;
  /** uid prefix; derived from the deck when empty. */
  uidPrefix?: string;
  /** Cards per batch for long documents (plan, batches, long-document advice). */
  batchSize?: number;
  /** Use only the document (default true); false allows flagged general knowledge. */
  onlyDocument?: boolean;
  documentType?: DocumentType;
  /** Adds the long-document workflow advice to the prompt. */
  longDocument?: boolean;
}

export interface ResolvedOptions {
  deck: string;
  language: string;
  level: Level;
  density: Density;
  hints: boolean;
  explanations: boolean;
  mcqChoices: number;
  uidPrefix: string;
  batchSize: number;
  onlyDocument: boolean;
  documentType: DocumentType | undefined;
  longDocument: boolean;
}

export const DEFAULT_PROMPT_OPTIONS = {
  level: 'intermediaire',
  density: 5,
  hints: true,
  explanations: true,
  mcqChoices: 4,
  batchSize: 40,
  onlyDocument: true,
  longDocument: false,
} as const satisfies PromptOptions;

const DEFAULT_DECK: I18nString = { fr: 'Mon cours', en: 'My course' };
const DEFAULT_UID_PREFIX: I18nString = { fr: 'carte', en: 'card' };

const LANGUAGE_NAMES: Readonly<Record<string, I18nString>> = {
  fr: { fr: 'français', en: 'French' },
  en: { fr: 'anglais', en: 'English' },
  es: { fr: 'espagnol', en: 'Spanish' },
  de: { fr: 'allemand', en: 'German' },
  it: { fr: 'italien', en: 'Italian' },
  pt: { fr: 'portugais', en: 'Portuguese' },
  nl: { fr: 'néerlandais', en: 'Dutch' },
  la: { fr: 'latin', en: 'Latin' },
  zh: { fr: 'chinois', en: 'Chinese' },
  ja: { fr: 'japonais', en: 'Japanese' },
  ar: { fr: 'arabe', en: 'Arabic' },
};

/** "fr" or "fr-CA" → "français"; any other text is kept as given; empty → the prompt locale. */
export function languageName(language: string | undefined, locale: Locale): string {
  const value = language?.trim() ?? '';
  if (value === '') return LANGUAGE_NAMES[locale]?.[locale] ?? locale;
  const code = /^([a-z]{2,3})(?:[-_][A-Za-z0-9]+)*$/i.exec(value)?.[1]?.toLowerCase();
  const known = code === undefined ? undefined : LANGUAGE_NAMES[code];
  return known ? known[locale] : value;
}

/** Readable, uid-safe slug of the root deck ("Réseaux::Ethernet" → "reseaux"). */
export function defaultUidPrefix(deck: string, locale: Locale): string {
  const slug = (deck.split('::')[0] ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16)
    .replace(/-+$/, '');
  return slug === '' ? DEFAULT_UID_PREFIX[locale] : slug;
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function resolveOptions(options: PromptOptions | undefined, locale: Locale): ResolvedOptions {
  const o = options ?? {};
  const deck = o.deck?.trim() || DEFAULT_DECK[locale];
  const prefix = o.uidPrefix?.trim() ?? '';
  return {
    deck,
    language: languageName(o.language, locale),
    level: o.level ?? DEFAULT_PROMPT_OPTIONS.level,
    density: o.density ?? DEFAULT_PROMPT_OPTIONS.density,
    hints: o.hints ?? DEFAULT_PROMPT_OPTIONS.hints,
    explanations: o.explanations ?? DEFAULT_PROMPT_OPTIONS.explanations,
    mcqChoices: clampInt(o.mcqChoices, 3, 6, DEFAULT_PROMPT_OPTIONS.mcqChoices),
    uidPrefix: /^[A-Za-z0-9._:-]{1,40}$/.test(prefix) ? prefix : defaultUidPrefix(deck, locale),
    batchSize: clampInt(o.batchSize, 5, 500, DEFAULT_PROMPT_OPTIONS.batchSize),
    onlyDocument: o.onlyDocument ?? DEFAULT_PROMPT_OPTIONS.onlyDocument,
    documentType: o.documentType,
    longDocument: o.longDocument ?? DEFAULT_PROMPT_OPTIONS.longDocument,
  };
}
