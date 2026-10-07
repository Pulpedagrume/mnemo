import type { Card, Id, Note } from '@mnemo/core';
import type { NoteSearch } from '../repository';

/** Minimal shape of a synchronisable entity. */
export interface Synced {
  id: Id;
  updatedAt: number;
  deletedAt?: number | undefined;
}

/** True when the entity is not a tombstone. */
export function isLive(entity: { deletedAt?: number | undefined }): boolean {
  return entity.deletedAt === undefined;
}

/** Case- and accent-insensitive form of a string: NFD, combining marks stripped, lower-cased. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Separator used to join searchable parts so a match cannot span two of them. */
const PART_SEPARATOR = '\u0000';

/** Searchable text of a note: field values, hints, explanation and tags, folded. */
export function noteHaystack(note: Note): string {
  const parts: string[] = [...Object.values(note.fields), ...note.hints, ...note.tags];
  if (note.explanation !== undefined) parts.push(note.explanation);
  return foldText(parts.join(PART_SEPARATOR));
}

/** `parent` matches `parent` and `parent::child` (case-insensitive). `wanted` must be lower-cased. */
function tagMatches(noteTag: string, wanted: string): boolean {
  const tag = noteTag.toLowerCase();
  return tag === wanted || tag.startsWith(`${wanted}::`);
}

export function hasCardFilter(query: NoteSearch): boolean {
  return (
    query.cardState !== undefined || query.suspended !== undefined || query.leech !== undefined
  );
}

/** Card-level part of a search: a live card matching every card filter of the query. */
export function cardMatches(card: Card, query: NoteSearch): boolean {
  return (
    isLive(card) &&
    (query.cardState === undefined || card.state === query.cardState) &&
    (query.suspended === undefined || card.suspended === query.suspended) &&
    (query.leech === undefined || card.leech === query.leech)
  );
}

/** Note ids having at least one card matching the card-level filters. */
export function matchingCardNoteIds(cards: Iterable<Card>, query: NoteSearch): Set<Id> {
  const ids = new Set<Id>();
  for (const card of cards) if (cardMatches(card, query)) ids.add(card.noteId);
  return ids;
}

/**
 * Compiles the note-level filters of a search into a predicate (tombstones always excluded).
 * An empty `deckIds`/`noteTypeIds` list matches nothing; `undefined` means "no filter".
 * `cardNoteIds`, when given, restricts results to these notes (card-level filters).
 */
export function compileNoteFilter(
  query: NoteSearch,
  cardNoteIds?: ReadonlySet<Id>,
): (note: Note) => boolean {
  const decks = query.deckIds === undefined ? undefined : new Set(query.deckIds);
  const types = query.noteTypeIds === undefined ? undefined : new Set(query.noteTypeIds);
  const tags = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  const text = query.text === undefined ? '' : foldText(query.text.trim());
  const { needsReview } = query;
  return (note) => {
    if (!isLive(note)) return false;
    if (decks !== undefined && !decks.has(note.deckId)) return false;
    if (types !== undefined && !types.has(note.noteTypeId)) return false;
    if (cardNoteIds !== undefined && !cardNoteIds.has(note.id)) return false;
    if (needsReview !== undefined && (note.needsReview === true) !== needsReview) return false;
    if (!tags.every((wanted) => note.tags.some((t) => tagMatches(t, wanted)))) return false;
    return text.length === 0 || noteHaystack(note).includes(text);
  };
}
