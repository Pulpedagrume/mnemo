import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Deck, Id, Note, QueueCounts } from '@mnemo/core';
import { DECK_SEPARATOR, builtinNoteType, normalizeDeckPath, primaryText } from '@mnemo/core';
import type { ServiceContext } from '@mnemo/services';
import type { NoteSearch } from '@mnemo/storage';
import { deckTreeWithCounts, listDecks, statsSummary } from '@mnemo/services';
import type { DeckTreeEntry } from '@mnemo/services';
import type { OpenCollection } from '../collection';
import { errorResult, jsonResult, truncate } from '../results';

export const MAX_SEARCH_LIMIT = 50;
const PRIMARY_TEXT_CHARS = 160;
const FORECAST_DAYS = 7;

interface DeckView {
  name: string;
  path: string;
  new: number;
  learning: number;
  review: number;
  children?: DeckView[];
}

const counts = (c: QueueCounts) => ({ new: c.new, learning: c.learning, review: c.review });

function deckView(entry: DeckTreeEntry): DeckView {
  const path = entry.node.deck.name;
  const name = path.split(DECK_SEPARATOR).pop() ?? path;
  const children = entry.children.map(deckView);
  return { name, path, ...counts(entry.counts), ...(children.length ? { children } : {}) };
}

function flatten(entries: DeckTreeEntry[]): DeckTreeEntry[] {
  return entries.flatMap((e) => [e, ...flatten(e.children)]);
}

/** Ids of the deck at `path` and of its subdecks; undefined when the deck does not exist. */
function subtreeIds(decks: Deck[], path: string): Id[] | undefined {
  const target = normalizeDeckPath(path).toLocaleLowerCase();
  const prefix = `${target}${DECK_SEPARATOR}`;
  const ids = decks
    .filter((d) => {
      const name = d.name.toLocaleLowerCase();
      return name === target || name.startsWith(prefix);
    })
    .map((d) => d.id);
  return ids.length > 0 ? ids : undefined;
}

async function noteText(ctx: ServiceContext, note: Note): Promise<string> {
  const type = builtinNoteType(note.noteTypeId) ?? (await ctx.repo.noteTypes.get(note.noteTypeId));
  const text = type ? primaryText(note, type) : '';
  return text.trim() !== '' ? text : (Object.values(note.fields)[0] ?? '');
}

export function registerBrowseTools(server: McpServer, openCollection: OpenCollection): void {
  server.registerTool(
    'mnemo_list_decks',
    {
      title: 'List decks',
      description:
        "Returns the deck tree of the local collection with today's counts (new, learning, review cards; subdecks included, daily limits applied). Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const tree = await openCollection((c) => deckTreeWithCounts(c.ctx));
      return jsonResult({ decks: tree.map(deckView) });
    },
  );

  server.registerTool(
    'mnemo_search_notes',
    {
      title: 'Search notes',
      description: `Searches the notes of the local collection (case- and accent-insensitive text, deck subtree, tag). Returns uid, deck, type and the main text (truncated). At most ${String(MAX_SEARCH_LIMIT)} results. Read-only.`,
      inputSchema: {
        text: z.string().max(500).optional().describe('Text to look for in fields, hints, tags.'),
        deck: z
          .string()
          .max(500)
          .optional()
          .describe('Deck path, e.g. "Biologie::Cellule" (subdecks included).'),
        tag: z.string().max(100).optional().describe('Tag the notes must have.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .default(20)
          .describe(`Maximum number of notes (1-${String(MAX_SEARCH_LIMIT)}, default 20).`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      openCollection(async (c) => {
        const decks = await listDecks(c.ctx);
        const deckIds = args.deck !== undefined ? subtreeIds(decks, args.deck) : undefined;
        if (args.deck !== undefined && !deckIds) return errorResult(`Unknown deck: ${args.deck}`);
        const query: NoteSearch = {
          ...(deckIds ? { deckIds } : {}),
          ...(args.tag !== undefined ? { tags: [args.tag] } : {}),
          ...(args.text !== undefined && args.text.trim() !== '' ? { text: args.text } : {}),
          sort: 'updated',
          descending: true,
          limit: args.limit,
        };
        const result = await c.ctx.repo.notes.search(query);
        const deckNames = new Map(decks.map((d) => [d.id, d.name]));
        const notes = await Promise.all(
          result.notes.map(async (n) => ({
            ...(n.uid !== undefined ? { uid: n.uid } : {}),
            deck: deckNames.get(n.deckId) ?? '',
            type: n.noteTypeId,
            text: truncate(await noteText(c.ctx, n), PRIMARY_TEXT_CHARS),
            ...(n.tags.length ? { tags: n.tags } : {}),
          })),
        );
        return jsonResult({ total: result.total, returned: notes.length, notes });
      }),
  );

  server.registerTool(
    'mnemo_due_summary',
    {
      title: 'Due cards summary',
      description: `Returns today's study counts per deck (new, learning, review) with the total, the cards reviewed today, and the number of reviews due on each of the next ${String(FORECAST_DAYS)} days. Read-only.`,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      openCollection(async (c) => {
        const tree = await deckTreeWithCounts(c.ctx);
        const stats = await statsSummary(c.ctx);
        const total = tree.reduce(
          (sum, e) => ({
            new: sum.new + e.counts.new,
            learning: sum.learning + e.counts.learning,
            review: sum.review + e.counts.review,
          }),
          { new: 0, learning: 0, review: 0 },
        );
        return jsonResult({
          total,
          decks: flatten(tree).map((e) => ({ deck: e.node.deck.name, ...counts(e.counts) })),
          reviewedToday: stats.activity.find((a) => a.day === stats.today)?.reviews ?? 0,
          totalCards: stats.totalCards,
          // Reviews due per day: [0] = today (overdue included), [1] = tomorrow…
          forecast: stats.forecast.slice(0, FORECAST_DAYS),
          streak: stats.streak,
        });
      }),
  );
}
