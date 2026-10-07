import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LOCALES } from '@mnemo/core';
import { buildImportJsonSchema } from '@mnemo/importers';
import {
  COMPOSED_TASK_IDS,
  DOCUMENT_TYPES,
  LEVELS,
  OUTPUT_FORMATS,
  buildPrompt,
  type OutputFormat,
  type PromptOptions,
} from '@mnemo/prompts';
import { deckTreeWithCounts, statsSummary, type DeckTreeEntry } from '@mnemo/services';
import { requireAuth } from '../auth/guard';
import type { AppContext } from '../context';
import { ApiError, parseInput } from '../errors';

const flag = z.enum(['true', 'false']).transform((v) => v === 'true');

const PromptQuerySchema = z.object({
  task: z.enum(COMPOSED_TASK_IDS).default('flashcards'),
  format: z
    .string()
    .refine((f): f is OutputFormat => (OUTPUT_FORMATS as readonly string[]).includes(f))
    .default('markdown'),
  lang: z.enum(LOCALES).default('fr'),
  deck: z.string().max(500).optional(),
  language: z.string().max(50).optional(),
  level: z.enum(LEVELS).optional(),
  density: z.enum(['3', '5', '10', 'exhaustif']).optional(),
  hints: flag.optional(),
  explanations: flag.optional(),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
});

const StatsQuerySchema = z.object({ deck: z.string().min(1).max(64).optional() });

interface DeckJson {
  id: string;
  name: string;
  counts: DeckTreeEntry['counts'];
  children: DeckJson[];
}

function deckJson(e: DeckTreeEntry): DeckJson {
  return {
    id: e.node.deck.id,
    name: e.node.deck.name,
    counts: e.counts,
    children: e.children.map(deckJson),
  };
}

function promptOptions(q: z.infer<typeof PromptQuerySchema>): PromptOptions {
  const o: PromptOptions = {};
  if (q.deck) o.deck = q.deck;
  if (q.language) o.language = q.language;
  if (q.level) o.level = q.level;
  if (q.density) o.density = q.density === 'exhaustif' ? 'exhaustif' : (Number(q.density) as 3);
  if (q.hints !== undefined) o.hints = q.hints;
  if (q.explanations !== undefined) o.explanations = q.explanations;
  if (q.documentType) o.documentType = q.documentType;
  return o;
}

/** Read-only collection routes and the AI helpers (prompts, JSON Schema). */
export function registerCollectionRoutes(api: FastifyInstance, app: AppContext): void {
  api.get('/decks', { config: { auth: { scope: 'read' } } }, async (req) => {
    const auth = requireAuth(req);
    const tree = await app.collections.withLock(auth.userId, (c) => deckTreeWithCounts(c.ctx));
    return { decks: tree.map(deckJson) };
  });

  api.get('/stats/summary', { config: { auth: { scope: 'read' } } }, async (req) => {
    const auth = requireAuth(req);
    const q = parseInput(StatsQuerySchema, req.query);
    return app.collections.withLock(auth.userId, async (c) => {
      if (q.deck && !(await c.repo.decks.get(q.deck))) {
        throw new ApiError(404, 'not_found', 'Deck not found');
      }
      return statsSummary(c.ctx, q.deck);
    });
  });

  api.get('/prompts', { config: { auth: { public: true } } }, (req) => {
    const q = parseInput(PromptQuerySchema, req.query);
    try {
      return buildPrompt({
        task: q.task,
        format: q.format,
        locale: q.lang,
        options: promptOptions(q),
      });
    } catch (e) {
      if (e instanceof RangeError) throw new ApiError(400, 'invalid_input', e.message);
      throw e;
    }
  });

  api.get('/schema', { config: { auth: { public: true } } }, (_req, reply) =>
    reply.header('cache-control', 'public, max-age=3600').send(buildImportJsonSchema()),
  );
}
