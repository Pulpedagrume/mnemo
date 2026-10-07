import { describe, expect, it } from 'vitest';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { initI18n } from './index';

/** Flattens nested translation objects into dotted keys, without plural suffixes. */
function keys(obj: object, prefix = ''): string[] {
  const out = Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v as object, `${prefix}${k}.`)
      : [`${prefix}${k.replace(/_(zero|one|two|few|many|other)$/, '')}`],
  );
  return [...new Set(out)].sort();
}

/** Interpolation variables used by every key. */
function vars(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? vars(v as object, `${prefix}${k}.`)
      : [
          `${prefix}${k.replace(/_(zero|one|two|few|many|other)$/, '')}:${[
            ...String(v).matchAll(/\{\{(\w+)\}\}/g),
          ]
            .map((m) => m[1])
            .filter((n) => n !== 'count')
            .sort()
            .join(',')}`,
        ],
  );
}

describe('translations', () => {
  it('fr and en define exactly the same keys', () => {
    expect(keys(en)).toEqual(keys(fr));
  });

  it('fr and en use the same interpolation variables', () => {
    // Literal cloze syntax in help texts is not a variable.
    const clean = (list: string[]) => [...new Set(list)].sort();
    expect(clean(vars(en))).toEqual(clean(vars(fr)));
  });

  it('pluralizes per locale', () => {
    const i18n = initI18n('fr');
    expect(i18n.t('app.decksCount', { count: 0 })).toBe('0 paquet');
    expect(i18n.t('app.decksCount', { count: 2 })).toBe('2 paquets');
    expect(i18n.t('app.decksCount', { count: 1_000_000 })).toBe('1000000 paquets');
    expect(i18n.t('app.decksCount', { count: 0, lng: 'en' })).toBe('0 decks');
    expect(i18n.t('app.decksCount', { count: 1, lng: 'en' })).toBe('1 deck');
  });
});
