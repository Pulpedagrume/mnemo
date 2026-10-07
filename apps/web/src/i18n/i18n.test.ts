import { describe, expect, it } from 'vitest';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { initI18n } from './index';

/** Flattens nested translation objects into dotted keys. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('fr and en define exactly the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it('pluralizes per locale', () => {
    const i18n = initI18n('fr');
    expect(i18n.t('app.decksCount', { count: 0 })).toBe('0 paquet');
    expect(i18n.t('app.decksCount', { count: 2 })).toBe('2 paquets');
    expect(i18n.t('app.decksCount', { count: 0, lng: 'en' })).toBe('0 decks');
    expect(i18n.t('app.decksCount', { count: 1, lng: 'en' })).toBe('1 deck');
  });
});
