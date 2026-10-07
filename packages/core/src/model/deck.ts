import { z } from 'zod';
import { DECK_SEPARATOR, IdSchema, syncFields } from './common';

export const DeckSchema = z.object({
  id: IdSchema,
  /** Full path, e.g. "Réseaux::Ethernet". */
  name: z.string().min(1).max(500),
  parentId: IdSchema.optional(),
  /** Absent: inherit the parent's preset (or the default preset at the root). */
  presetId: IdSchema.optional(),
  description: z.string().max(10_000).optional(),
  ...syncFields,
});
export type Deck = z.infer<typeof DeckSchema>;

/** Splits and trims a deck path; empty segments are dropped. */
export function deckPathSegments(path: string): string[] {
  return path
    .split(DECK_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function normalizeDeckPath(path: string): string {
  return deckPathSegments(path).join(DECK_SEPARATOR);
}

/** Last segment of a deck path, for display in a tree. */
export function deckLeafName(path: string): string {
  const segs = deckPathSegments(path);
  return segs[segs.length - 1] ?? path;
}

/** All ancestor paths, root first: "A::B::C" -> ["A", "A::B"]. */
export function deckAncestorPaths(path: string): string[] {
  const segs = deckPathSegments(path);
  return segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join(DECK_SEPARATOR));
}
