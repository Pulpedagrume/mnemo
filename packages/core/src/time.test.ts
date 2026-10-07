import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  dayIndex,
  dayStartMs,
  formatInterval,
  isValidTimeZone,
  localParts,
  parseDuration,
  studyCalendar,
} from './time';

const PARIS = 'Europe/Paris';

describe('dayIndex', () => {
  it('counts days since epoch in UTC with rollover at 0', () => {
    expect(dayIndex(0, 'UTC', 0)).toBe(0);
    expect(dayIndex(DAY_MS - 1, 'UTC', 0)).toBe(0);
    expect(dayIndex(DAY_MS, 'UTC', 0)).toBe(1);
  });

  it('keeps reviews before the rollover hour on the previous day', () => {
    // 2026-10-07 03:30 in Paris (UTC+2) = 01:30 UTC
    const beforeRollover = Date.UTC(2026, 9, 7, 1, 30);
    const afterRollover = Date.UTC(2026, 9, 7, 2, 30); // 04:30 Paris
    expect(dayIndex(afterRollover, PARIS, 4) - dayIndex(beforeRollover, PARIS, 4)).toBe(1);
  });

  it('handles midnight: 23:59 and 00:01 local are the same study day with rollover 4', () => {
    const a = Date.UTC(2026, 9, 6, 21, 59); // 23:59 Paris
    const b = Date.UTC(2026, 9, 6, 22, 1); // 00:01 Paris next calendar day
    expect(dayIndex(a, PARIS)).toBe(dayIndex(b, PARIS));
  });

  it('depends on the time zone', () => {
    const t = Date.UTC(2026, 9, 7, 3, 0); // 05:00 Paris, 23:00 New York (previous day)
    expect(dayIndex(t, PARIS)).toBe(dayIndex(t, 'America/New_York') + 1);
  });
});

describe('dayStartMs', () => {
  it('is the inverse of dayIndex at the rollover hour', () => {
    for (const tz of ['UTC', PARIS, 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
      const now = Date.UTC(2026, 5, 15, 12, 0);
      const idx = dayIndex(now, tz, 4);
      const start = dayStartMs(idx, tz, 4);
      expect(dayIndex(start, tz, 4)).toBe(idx);
      expect(dayIndex(start - 1, tz, 4)).toBe(idx - 1);
      expect(localParts(start, tz).hour).toBe(4);
    }
  });

  it('survives DST transitions (days of 23 and 25 hours)', () => {
    // Paris: 2026-03-29 spring forward, 2026-10-25 fall back.
    const spring = dayIndex(Date.UTC(2026, 2, 29, 12), PARIS);
    expect(dayStartMs(spring + 1, PARIS) - dayStartMs(spring, PARIS)).toBe(DAY_MS);
    const before = dayIndex(Date.UTC(2026, 2, 28, 12), PARIS);
    expect(dayStartMs(spring, PARIS) - dayStartMs(before, PARIS)).toBe(DAY_MS - HOUR_MS);
    const fall = dayIndex(Date.UTC(2026, 9, 24, 12), PARIS);
    expect(dayStartMs(fall + 1, PARIS) - dayStartMs(fall, PARIS)).toBe(DAY_MS + HOUR_MS);
  });

  it('handles far-future days', () => {
    const idx = dayIndex(Date.UTC(2120, 0, 1, 12), PARIS);
    expect(dayIndex(dayStartMs(idx, PARIS), PARIS)).toBe(idx);
  });
});

describe('studyCalendar', () => {
  it('binds zone and rollover', () => {
    const cal = studyCalendar('UTC', 0);
    expect(cal.today(DAY_MS * 3 + 5)).toBe(3);
    expect(cal.startOf(3)).toBe(DAY_MS * 3);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone(PARIS)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('parseDuration', () => {
  it.each([
    ['10m', 10 * MINUTE_MS],
    ['1d', DAY_MS],
    ['3j', 3 * DAY_MS],
    ['1w', 7 * DAY_MS],
    ['2sem', 14 * DAY_MS],
    ['1mo', 30 * DAY_MS],
    ['6mois', 180 * DAY_MS],
    ['1y', 365 * DAY_MS],
    ['1.5h', 1.5 * HOUR_MS],
    [' 30s ', 30_000],
  ])('%s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('rejects invalid input', () => {
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('10 parsecs')).toBeUndefined();
    expect(parseDuration('-1d')).toBeUndefined();
  });
});

describe('formatInterval', () => {
  it('formats in French and English', () => {
    expect(formatInterval(30_000, 'fr')).toBe('< 1 min');
    expect(formatInterval(10 * MINUTE_MS, 'fr')).toBe('10 min');
    expect(formatInterval(3 * HOUR_MS, 'en')).toBe('3 h');
    expect(formatInterval(4 * DAY_MS, 'fr')).toBe('4 j');
    expect(formatInterval(4 * DAY_MS, 'en')).toBe('4 d');
    expect(formatInterval(75 * DAY_MS, 'fr')).toBe('2,5 mois');
    expect(formatInterval(75 * DAY_MS, 'en')).toBe('2.5 mo');
    expect(formatInterval(365 * DAY_MS, 'fr')).toBe('1 an');
    expect(formatInterval(3 * 365 * DAY_MS, 'fr')).toBe('3 ans');
    expect(formatInterval(3 * 365 * DAY_MS, 'en')).toBe('3 y');
  });
});
