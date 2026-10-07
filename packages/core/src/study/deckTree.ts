import type { Id } from '../model/common';
import type { Deck } from '../model/deck';
import { deckLeafName } from '../model/deck';
import type { Preset } from '../model/preset';

export interface DeckNode {
  deck: Deck;
  children: DeckNode[];
  depth: number;
}

const byName = (a: Deck, b: Deck) => a.name.localeCompare(b.name);

/** Builds the deck forest (non-deleted decks), children sorted by name. Orphans become roots. */
export function buildDeckTree(decks: readonly Deck[]): DeckNode[] {
  const live = decks.filter((d) => d.deletedAt === undefined);
  const ids = new Set(live.map((d) => d.id));
  const childrenOf = new Map<Id | undefined, Deck[]>();
  for (const d of live) {
    const parent = d.parentId !== undefined && ids.has(d.parentId) ? d.parentId : undefined;
    const list = childrenOf.get(parent) ?? [];
    list.push(d);
    childrenOf.set(parent, list);
  }
  const visit = (parent: Id | undefined, depth: number, seen: Set<Id>): DeckNode[] =>
    (childrenOf.get(parent) ?? [])
      .slice()
      .sort(byName)
      .filter((d) => !seen.has(d.id))
      .map((deck) => {
        const nextSeen = new Set(seen).add(deck.id);
        return { deck, depth, children: visit(deck.id, depth + 1, nextSeen) };
      });
  return visit(undefined, 0, new Set());
}

/** Index of decks by id plus parent links, for repeated lookups. */
export interface DeckIndex {
  byId: ReadonlyMap<Id, Deck>;
  /** Deck id followed by its ancestors, nearest first. Cycle-safe. */
  ancestry(id: Id): Id[];
  /** The deck and all its descendants. */
  subtree(id: Id): Id[];
}

export function indexDecks(decks: readonly Deck[]): DeckIndex {
  const live = decks.filter((d) => d.deletedAt === undefined);
  const byId = new Map(live.map((d) => [d.id, d] as const));
  const children = new Map<Id, Id[]>();
  for (const d of live) {
    if (d.parentId === undefined || !byId.has(d.parentId)) continue;
    const list = children.get(d.parentId) ?? [];
    list.push(d.id);
    children.set(d.parentId, list);
  }
  return {
    byId,
    ancestry(id) {
      const out: Id[] = [];
      let cur: Id | undefined = id;
      while (cur !== undefined && byId.has(cur) && !out.includes(cur)) {
        out.push(cur);
        cur = byId.get(cur)?.parentId;
      }
      return out;
    },
    subtree(id) {
      const out: Id[] = [];
      const stack = byId.has(id) ? [id] : [];
      while (stack.length > 0) {
        const cur = stack.pop() as Id;
        if (out.includes(cur)) continue;
        out.push(cur);
        stack.push(...(children.get(cur) ?? []));
      }
      return out;
    },
  };
}

/**
 * Preset of a deck: its own presetId, else the nearest ancestor's, else the default preset.
 * Unknown or deleted presets are skipped.
 */
export function resolveDeckPreset(
  deckId: Id,
  index: DeckIndex,
  presets: ReadonlyMap<Id, Preset>,
  defaultPreset: Preset,
): Preset {
  for (const id of index.ancestry(deckId)) {
    const presetId = index.byId.get(id)?.presetId;
    if (presetId === undefined) continue;
    const preset = presets.get(presetId);
    if (preset && preset.deletedAt === undefined) return preset;
  }
  return defaultPreset;
}

/** Display label of a deck in a tree (last path segment). */
export function deckLabel(deck: Deck): string {
  return deckLeafName(deck.name);
}
