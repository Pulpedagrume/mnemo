import { blankMemory, type CardMemory, type CardState } from '@mnemo/core';
import type { ImportIssue } from '../report';
import { apkgIssues } from './issues';

/** Scheduling of one imported card, keyed by template ord (cloze number - 1 for clozes). */
export interface ApkgScheduleEntry {
  ord: number;
  memory: CardMemory;
  suspended: boolean;
}

/** Row of the Anki `cards` table (only the columns used here). */
export interface AnkiCardRow {
  nid: string;
  did: string;
  odid: string;
  ord: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  type: number;
  /** -3/-2 buried, -1 suspended, 0 new, 1 learning, 2 review, 3 day learning, 4 preview. */
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  /** JSON `{ "s": stability, "d": difficulty }` written by FSRS-enabled Anki versions. */
  data: string;
}

const DAY_MS = 86_400_000;
const STATES: Readonly<Record<number, CardState>> = { 1: 'learning', 2: 'review', 3: 'relearning' };

export type ScheduleOutcome =
  | { kind: 'new' }
  | { kind: 'ok'; entry: ApkgScheduleEntry }
  | { kind: 'unsupported'; reason: string };

function fsrsMemory(data: string): { stability: number; difficulty: number } | undefined {
  if (!data.trim().startsWith('{')) return undefined;
  try {
    const raw = JSON.parse(data) as Record<string, unknown>;
    const s = raw.s;
    const d = raw.d;
    return typeof s === 'number' && typeof d === 'number' && s >= 0 && d >= 0
      ? { stability: s, difficulty: d }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts an Anki card to a scheduling memory for the `anki` algorithm family: ease =
 * factor / 1000, interval in days, day-based due dates counted from the collection creation
 * (`crtSeconds`), learning due dates in epoch seconds.
 */
export function convertCard(card: AnkiCardRow, crtSeconds: number | undefined): ScheduleOutcome {
  const suspended = card.queue === -1;
  if (card.type === 0) {
    // New cards keep their own memory; only a suspension is carried over.
    if (!suspended) return { kind: 'new' };
    return { kind: 'ok', entry: { ord: card.ord, memory: blankMemory(0), suspended } };
  }
  const state = STATES[card.type];
  if (state === undefined) return { kind: 'unsupported', reason: `type ${card.type}` };
  if (card.queue === 4) return { kind: 'unsupported', reason: 'preview' };
  let due: number;
  if (card.queue === 1) due = card.due * 1000;
  else if (crtSeconds === undefined || !Number.isFinite(crtSeconds))
    return { kind: 'unsupported', reason: 'crt' };
  else due = crtSeconds * 1000 + card.due * DAY_MS;
  if (!Number.isFinite(due) || due < 0) return { kind: 'unsupported', reason: 'due' };
  const interval = card.ivl > 0 ? card.ivl : 0;
  const memory: CardMemory = {
    state,
    due,
    interval,
    ease: card.factor > 0 ? card.factor / 1000 : 2.5,
    stability: 0,
    difficulty: 0,
    reps: Math.max(0, Math.trunc(card.reps)),
    lapses: Math.max(0, Math.trunc(card.lapses)),
    step: 0,
    box: 0,
  };
  if (state === 'review' && interval > 0) memory.lastReview = Math.max(0, due - interval * DAY_MS);
  const fsrs = fsrsMemory(card.data);
  if (fsrs) Object.assign(memory, fsrs);
  return { kind: 'ok', entry: { ord: card.ord, memory, suspended } };
}

/** Scheduling of the imported notes' cards, by note uid; unsupported states are reported. */
export function collectScheduling(
  cardsByNote: ReadonlyMap<string, readonly AnkiCardRow[]>,
  crtSeconds: number | undefined,
  uids: ReadonlyMap<string, string>,
  issues: ImportIssue[],
): Map<string, ApkgScheduleEntry[]> {
  const out = new Map<string, ApkgScheduleEntry[]>();
  const reasons = new Map<string, number>();
  for (const [nid, cards] of cardsByNote) {
    const uid = uids.get(nid);
    if (uid === undefined) continue;
    const entries: ApkgScheduleEntry[] = [];
    for (const card of cards) {
      const r = convertCard(card, crtSeconds);
      if (r.kind === 'ok') entries.push(r.entry);
      else if (r.kind === 'unsupported') reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    }
    if (entries.length > 0) out.set(uid, entries);
  }
  const total = [...reasons.values()].reduce((a, n) => a + n, 0);
  if (total > 0)
    issues.push(apkgIssues.unsupportedScheduling(total, [...reasons.keys()].join(', ')));
  return out;
}
