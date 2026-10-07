export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** A user-facing string available in every supported locale. */
export type I18nString = Readonly<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported locale for a BCP-47 tag such as `en-GB`; falls back to the default. */
export function resolveLocale(tag: string | undefined): Locale {
  const base = tag?.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function localize(text: I18nString, locale: Locale): string {
  return text[locale];
}
