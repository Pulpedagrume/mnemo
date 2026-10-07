import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IMPORT_MODES } from '@mnemo/core';
import type { ImportParseResult } from '@mnemo/importers';
import { parseImport, readBundle } from '@mnemo/importers';
import { applyImport, ensureCollection, planImport, type MediaPayload } from '@mnemo/services';
import { requireAuth } from '../auth/guard';
import { recordServerWrites } from '../collections/serverWrites';
import type { AppContext, RateLimits } from '../context';
import { ApiError, parseInput } from '../errors';

const ImportOptionsSchema = z.object({
  fileName: z.string().trim().min(1).max(255).default('import.md'),
  mode: z.enum(IMPORT_MODES).default('skip-duplicates'),
  targetDeck: z.string().trim().min(1).max(500).default('Import'),
  dryRun: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
  lang: z.enum(['fr', 'en']).default('fr'),
});
const JsonImportSchema = ImportOptionsSchema.extend({ text: z.string().min(1) });
type ImportOptions = z.infer<typeof ImportOptionsSchema>;

interface LoadedInput {
  opts: ImportOptions;
  result: ImportParseResult;
  media: Map<string, MediaPayload>;
}

async function parseBytes(bytes: Uint8Array, opts: ImportOptions, maxBytes: number) {
  const media = new Map<string, MediaPayload>();
  if (!/\.zip$/i.test(opts.fileName)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { result: parseImport(text, { fileName: opts.fileName, maxBytes }), media };
  }
  const bundle = await readBundle(bytes, { maxTotalBytes: maxBytes });
  const result = parseImport(bundle.main?.text ?? '', {
    fileName: bundle.main?.name ?? opts.fileName,
    maxBytes,
  });
  result.report.issues.unshift(...bundle.issues);
  // Bundle files are referenced by path (media/fig.png); map them to declared media ids.
  for (const decl of result.media) {
    const entry = decl.file ? bundle.media.get(decl.file.replace(/^\.?\//, '')) : undefined;
    if (entry) {
      media.set(decl.id, {
        bytes: entry.bytes,
        mime: entry.mime,
        name: decl.file?.split('/').pop() ?? decl.id,
      });
    }
  }
  return { result, media };
}

/** Accepts `multipart/form-data` (one `file` + option fields) or JSON `{ text, … }`. */
async function loadInput(req: FastifyRequest, maxBytes: number): Promise<LoadedInput> {
  if (req.isMultipart()) {
    const file = await req.file();
    if (!file) throw new ApiError(400, 'invalid_input', 'Missing file');
    const bytes = new Uint8Array(await file.toBuffer());
    const fields: Record<string, unknown> = { fileName: file.filename };
    for (const [name, field] of Object.entries(file.fields)) {
      if (field && !Array.isArray(field) && field.type === 'field') fields[name] = field.value;
    }
    const opts = parseInput(ImportOptionsSchema, fields);
    return { opts, ...(await parseBytes(bytes, opts, maxBytes)) };
  }
  const body = parseInput(JsonImportSchema, req.body);
  const { text, ...opts } = body;
  return {
    opts,
    result: parseImport(text, { fileName: opts.fileName, maxBytes }),
    media: new Map(),
  };
}

export function registerImportRoutes(api: FastifyInstance, app: AppContext, limits: RateLimits) {
  api.post(
    '/import',
    {
      config: {
        auth: { scope: 'import' },
        rateLimit: { max: limits.import, timeWindow: limits.windowMs },
      },
    },
    async (req) => {
      const auth = requireAuth(req);
      const { opts, result, media } = await loadInput(req, app.config.maxUploadBytes);
      const response = await app.collections.withLock(auth.userId, async (c) => {
        const planOpts = { mode: opts.mode, targetDeck: opts.targetDeck };
        const plan = await planImport(c.ctx, result, planOpts);
        if (opts.dryRun || result.notes.length === 0) {
          return { plan, batchId: null, cursor: null };
        }
        const start = app.clock.now();
        await ensureCollection(c.ctx, opts.lang);
        const batch = await applyImport(c.ctx, result, {
          ...planOpts,
          fileName: opts.fileName,
          media,
        });
        const cursor = await recordServerWrites(c, start, batch);
        return { plan, batchId: batch.id, cursor };
      });
      const imported = response.batchId !== null;
      app.accounts.audit(auth.userId, 'import', {
        fileName: opts.fileName,
        format: result.format,
        mode: opts.mode,
        dryRun: opts.dryRun,
        imported,
        via: auth.via,
        ip: req.ip,
        counts: result.report.counts,
        plan: response.plan.counts,
      });
      return {
        dryRun: opts.dryRun,
        imported,
        batchId: response.batchId,
        format: result.format,
        counts: result.report.counts,
        plan: {
          counts: response.plan.counts,
          decksToCreate: response.plan.decksToCreate,
          replaced: response.plan.replaced,
        },
        report: result.report,
      };
    },
  );
}
