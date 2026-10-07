import type { Card, ImportBatch, Note, ReviewLog } from '@mnemo/core';
import type { NoteSearch, NoteSearchResult } from '../repository';
import type { Synced } from './match';

/**
 * Orderings shared by every implementation so results are identical across backends.
 * Strings compare by UTF-16 code units, like IndexedDB keys.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareById(a: { id: string }, b: { id: string }): number {
  return compareStrings(a.id, b.id);
}

/** `changedSince` order: updatedAt, then id. */
export function compareChanged(a: Synced, b: Synced): number {
  return a.updatedAt - b.updatedAt || compareById(a, b);
}

/** `dueBefore` order: due, then id. */
export function compareDue(a: Card, b: Card): number {
  return a.due - b.due || compareById(a, b);
}

/** `newCards` order: newPosition (missing last), then id. */
export function compareNew(a: Card, b: Card): number {
  const pa = a.newPosition ?? Number.POSITIVE_INFINITY;
  const pb = b.newPosition ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return compareById(a, b);
}

/** Review log order: ts, then id. */
export function compareLogs(a: ReviewLog, b: ReviewLog): number {
  return a.ts - b.ts || compareById(a, b);
}

/** Import batches, most recent first (ties: id descending). */
export function compareBatchesDesc(a: ImportBatch, b: ImportBatch): number {
  return b.createdAt - a.createdAt || compareById(b, a);
}

/** Sorts (in place) and paginates search matches. Default: created ascending; ties by id. */
export function sortAndPage(matches: Note[], query: NoteSearch): NoteSearchResult {
  const key = query.sort === 'updated' ? 'updatedAt' : 'createdAt';
  const dir = query.descending === true ? -1 : 1;
  matches.sort((a, b) => dir * (a[key] - b[key] || compareById(a, b)));
  const offset = Math.max(0, query.offset ?? 0);
  const end = query.limit === undefined ? undefined : offset + Math.max(0, query.limit);
  return { notes: matches.slice(offset, end), total: matches.length };
}

/** Distinct tags of live notes with usage counts (one per note), sorted by tag. */
export function countTags(notes: Iterable<Note>): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.deletedAt !== undefined) continue;
    for (const tag of new Set(note.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => compareStrings(a.tag, b.tag));
}

/** Applies an optional limit (`undefined` = no limit, negative = 0). */
export function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  return limit === undefined ? items : items.slice(0, Math.max(0, limit));
}

/** Change time of a review log for sync: its creation, or its deletion when undone. */
export function logChangeTime(log: ReviewLog): number {
  return Math.max(log.ts, log.deletedAt ?? 0);
}

/** `ReviewLogStore.changedSince` order: change time, then id. */
export function compareLogChanges(a: ReviewLog, b: ReviewLog): number {
  return logChangeTime(a) - logChangeTime(b) || compareById(a, b);
}
