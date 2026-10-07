import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  MAX_PUSH_BYTES,
  MediaMissingRequestSchema,
  PullRequestSchema,
  PushRequestSchema,
  applyPush,
  handleMissingMedia,
  handlePull,
  type BatchRegistry,
  type PushResponse,
} from '@mnemo/sync';
import { requireAuth } from '../auth/guard';
import type { UserCollection } from '../collections/registry';
import type { AppContext, RateLimits } from '../context';
import { ApiError, parseInput } from '../errors';

/** Maximum size of one media content transferred by sync. */
export const MAX_SYNC_MEDIA_BYTES = 5 * 1024 * 1024;

const ShaParamsSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * Transparently inflates `Content-Encoding: gzip` bodies. The route `bodyLimit` then applies to
 * the inflated size, which bounds decompression bombs.
 */
function gunzipIfNeeded(req: FastifyRequest, payload: Readable): Readable {
  const encoding = req.headers['content-encoding'];
  if (encoding === undefined || encoding === 'identity') return payload;
  if (encoding !== 'gzip') {
    throw new ApiError(415, 'unsupported_encoding', 'Only gzip bodies are accepted');
  }
  const gunzip = Object.assign(createGunzip(), { receivedEncodedLength: 0 });
  payload.on('data', (chunk: Buffer) => {
    gunzip.receivedEncodedLength += chunk.length;
  });
  payload.on('error', (e) => gunzip.destroy(e));
  return payload.pipe(gunzip);
}

function inflateBody(
  req: FastifyRequest,
  _reply: unknown,
  payload: Readable,
  done: (err: Error | null, value?: Readable) => void,
): void {
  try {
    done(null, gunzipIfNeeded(req, payload));
  } catch (e) {
    done(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Applies a push. The change log and batch registry live in another file than the collection, so
 * the batch id is only recorded once the collection transaction has committed: a crash in between
 * makes the client resend the batch, which merges idempotently, instead of losing it.
 */
async function push(c: UserCollection, body: Parameters<typeof applyPush>[3]) {
  const pending: [string, PushResponse][] = [];
  const deferred: BatchRegistry = {
    get: (id) => c.batches.get(id),
    put: (id, res) => {
      pending.push([id, res]);
      return Promise.resolve();
    },
  };
  const res = await applyPush(c.repo, c.changeLog, deferred, body);
  for (const [id, r] of pending) await c.batches.put(id, r);
  return res;
}

/** Sync protocol of docs/SYNC.md. Every route needs a session or a token with the `sync` scope. */
export function registerSyncRoutes(api: FastifyInstance, app: AppContext, limits: RateLimits) {
  const config = {
    auth: { scope: 'sync' as const },
    rateLimit: { max: limits.sync, timeWindow: limits.windowMs },
  };

  api.post('/sync/pull', { config, preParsing: inflateBody }, async (req) => {
    const auth = requireAuth(req);
    const body = parseInput(PullRequestSchema, req.body ?? {});
    return app.collections.withLock(auth.userId, (c) => handlePull(c.changeLog, body));
  });

  api.post(
    '/sync/push',
    {
      config,
      bodyLimit: MAX_PUSH_BYTES,
      preParsing: inflateBody,
    },
    async (req) => {
      const auth = requireAuth(req);
      const body = parseInput(PushRequestSchema, req.body);
      return app.collections.withLock(auth.userId, (c) => push(c, body));
    },
  );

  api.post('/sync/media/missing', { config }, async (req) => {
    const auth = requireAuth(req);
    const body = parseInput(MediaMissingRequestSchema, req.body);
    const c = await app.collections.get(auth.userId);
    return { missing: await handleMissingMedia(c.media, body.sha256) };
  });

  // Raw media bytes: any content type is read as a buffer, in this scope only.
  void api.register((scope, _opts, done) => {
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, next) => {
      next(null, body);
    });

    scope.put(
      '/sync/media/:sha256',
      { config, bodyLimit: MAX_SYNC_MEDIA_BYTES },
      async (req, reply) => {
        const auth = requireAuth(req);
        const { sha256 } = parseInput(ShaParamsSchema, req.params);
        if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'invalid_input', 'Missing body');
        const bytes = new Uint8Array(req.body);
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== sha256) {
          throw new ApiError(400, 'hash_mismatch', 'Content does not match its SHA-256');
        }
        await app.collections.withLock(auth.userId, (c) => c.media.put(sha256, bytes));
        return reply.status(204).send();
      },
    );

    scope.get('/sync/media/:sha256', { config }, async (req, reply) => {
      const auth = requireAuth(req);
      const { sha256 } = parseInput(ShaParamsSchema, req.params);
      const c = await app.collections.get(auth.userId);
      const bytes = await c.media.get(sha256);
      if (!bytes) throw new ApiError(404, 'not_found', 'Media not found');
      return reply
        .header('content-type', 'application/octet-stream')
        .header('cache-control', 'private, max-age=31536000, immutable')
        .send(Buffer.from(bytes));
    });
    done();
  });
}
