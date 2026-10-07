import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  FORMAT_ID,
  manualClock,
  randomInt,
  resolveLocale,
  localize,
  seededRng,
  shuffled,
  systemClock,
} from './index';

describe('app identity', () => {
  it('exposes the app name and a stable format id', () => {
    expect(APP_NAME).toBe('Mnemo');
    expect(FORMAT_ID).toBe('mnemo/1');
  });
});

describe('i18n', () => {
  it('resolves BCP-47 tags to supported locales', () => {
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('fr_CA')).toBe('fr');
    expect(resolveLocale('de-DE')).toBe('fr');
    expect(resolveLocale(undefined)).toBe('fr');
  });

  it('localizes an I18nString', () => {
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello');
  });
});

describe('clock', () => {
  it('manual clock only moves when told to', () => {
    const clock = manualClock(1_000);
    expect(clock.now()).toBe(1_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_500);
    clock.set(42);
    expect(clock.now()).toBe(42);
  });

  it('system clock returns a plausible epoch', () => {
    expect(systemClock.now()).toBeGreaterThan(Date.UTC(2024, 0, 1));
  });
});

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = seededRng(123);
    const b = seededRng(123);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('differs between seeds', () => {
    expect(seededRng(1).next()).not.toBe(seededRng(2).next());
  });

  it('randomInt stays within bounds and rejects bad ranges', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(rng, 3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(() => randomInt(rng, 5, 1)).toThrow(RangeError);
    expect(() => randomInt(rng, 0.5, 1)).toThrow(RangeError);
  });

  it('shuffled returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(seededRng(99), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(shuffled(seededRng(99), input)).toEqual(out);
  });
});
