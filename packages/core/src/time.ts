import type { Locale } from './i18n';

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock components of `ms` in an IANA time zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** Offset (local - UTC) in ms of `timeZone` at instant `ms`. */
function zoneOffset(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (ms % SECOND_MS));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Index of the study day containing `now`: days since 1970-01-01 in `timeZone`, where a day starts
 * at `rolloverHour` local time (default 4). Reviews done at 2 AM count for the previous day.
 */
export function dayIndex(now: number, timeZone: string, rolloverHour = 4): number {
  const p = localParts(now, timeZone);
  const localDay = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
  return p.hour < rolloverHour ? localDay - 1 : localDay;
}

/** Epoch ms at which study day `index` starts (its rollover hour, local time). DST-safe. */
export function dayStartMs(index: number, timeZone: string, rolloverHour = 4): number {
  const wall = index * DAY_MS + rolloverHour * HOUR_MS; // wall-clock time expressed as if UTC
  let guess = wall - zoneOffset(wall, timeZone);
  // Second pass fixes the case where the offset differs on either side of a DST transition.
  guess = wall - zoneOffset(guess, timeZone);
  return guess;
}

/** Study-day helpers bound to a user's time zone and rollover hour. */
export interface StudyCalendar {
  timeZone: string;
  rolloverHour: number;
  today(now: number): number;
  startOf(index: number): number;
}

export function studyCalendar(timeZone: string, rolloverHour = 4): StudyCalendar {
  return {
    timeZone,
    rolloverHour,
    today: (now) => dayIndex(now, timeZone, rolloverHour),
    startOf: (index) => dayStartMs(index, timeZone, rolloverHour),
  };
}

const DURATION_RE = /^\s*(\d+(?:\.\d+)?)\s*(s|m|min|h|d|j|w|sem|mo|mois|y|an)\s*$/i;
const UNIT_MS: Record<string, number> = {
  s: SECOND_MS,
  m: MINUTE_MS,
  min: MINUTE_MS,
  h: HOUR_MS,
  d: DAY_MS,
  j: DAY_MS,
  w: 7 * DAY_MS,
  sem: 7 * DAY_MS,
  mo: 30 * DAY_MS,
  mois: 30 * DAY_MS,
  y: 365 * DAY_MS,
  an: 365 * DAY_MS,
};

/** Parses "10m", "1d", "2w", "3mo", "1y" (also French "1j", "2sem", "3mois", "1an") into ms. */
export function parseDuration(text: string): number | undefined {
  const m = DURATION_RE.exec(text);
  if (!m) return undefined;
  const unit = UNIT_MS[(m[2] ?? '').toLowerCase()];
  return unit === undefined ? undefined : Number(m[1]) * unit;
}

const UNIT_LABELS: Record<Locale, { min: string; h: string; d: string; mo: string; y: string }> = {
  fr: { min: 'min', h: 'h', d: 'j', mo: 'mois', y: 'an' },
  en: { min: 'min', h: 'h', d: 'd', mo: 'mo', y: 'y' },
};

/** Compact interval label for rating buttons: "< 1 min", "10 min", "3 h", "4 j", "2,5 mois". */
export function formatInterval(ms: number, locale: Locale): string {
  const u = UNIT_LABELS[locale];
  const num = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (ms < MINUTE_MS) return `< 1 ${u.min}`;
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)} ${u.min}`;
  if (ms < DAY_MS) return `${num(ms / HOUR_MS)} ${u.h}`;
  if (ms < 30 * DAY_MS) return `${Math.round(ms / DAY_MS)} ${u.d}`;
  if (ms < 365 * DAY_MS) return `${num(ms / (30 * DAY_MS))} ${u.mo}`;
  const years = ms / (365 * DAY_MS);
  return `${num(years)} ${locale === 'fr' && years >= 2 ? 'ans' : u.y}`;
}
