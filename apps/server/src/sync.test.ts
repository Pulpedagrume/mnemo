import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { manualClock, seededRng, createIdGenerator } from '@mnemo/core';
import { parseImport } from '@mnemo/importers';
import { applyImport, createServiceContext, ensureCollection } from '@mnemo/services';
import { createMemoryRepository } from '@mnemo/storage';
import {
  createHlcClock,
  createMemorySyncStateStore,
  createSyncClient,
  withSyncStamps,
  type PullResponse,
  type PushResponse,
  type SyncTransport,
} from '@mnemo/sync';
import {
  SAMPLE_MARKDOWN,
  bearer,
  createToken,
  register,
  startTestServer,
  type TestServer,
} from './test/helpers';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** SyncTransport over the HTTP API (through `app.inject`), push bodies gzip-compressed. */
function httpTransport(app: FastifyInstance, secret: string): SyncTransport {
  const auth = bearer(secret);
  const post = async <T>(url: string, body: unknown, gzip = false): Promise<T> => {
    const json = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: {
        ...auth,
        'content-type': 'application/json',
        ...(gzip ? { 'content-encoding': 'gzip' } : {}),
      },
      payload: gzip ? gzipSync(json) : json,
    });
    if (res.statusCode !== 200) throw new Error(`${url}: ${String(res.statusCode)} ${res.body}`);
    return res.json<T>();
  };
  return {
    pull: (req) => post<PullResponse>('/api/v1/sync/pull', req),
    push: (req) => post<PushResponse>('/api/v1/sync/push', req, true),
    missingMedia: async (sha256) =>
      (await post<{ missing: string[] }>('/api/v1/sync/media/missing', { sha256 })).missing,
    uploadMedia: async (sha256, bytes) => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/sync/media/${sha256}`,
        headers: { ...auth, 'content-type': 'application/octet-stream' },
        payload: Buffer.from(bytes),
      });
      if (res.statusCode !== 204) throw new Error(`upload: ${res.body}`);
    },
    downloadMedia: async (sha256) => {
      const res = await app.inject({ url: `/api/v1/sync/media/${sha256}`, headers: auth });
      return res.statusCode === 200 ? new Uint8Array(res.rawPayload) : undefined;
    },
  };
}

function device(name: string, transport: SyncTransport, seed: number) {
  const clock = manualClock(Date.UTC(2026, 0, 15, 12) + seed);
  const raw = createMemoryRepository();
  const hlc = createHlcClock(clock, name);
  const ctx = createServiceContext({
    repo: withSyncStamps(raw, hlc),
    clock,
    rng: seededRng(seed),
    deviceTimeZone: 'UTC',
  });
  const client = createSyncClient({
    repo: raw,
    transport,
    hlc,
    deviceId: name,
    state: createMemorySyncStateStore(),
    ids: createIdGenerator(clock, seededRng(seed + 100)),
    clock,
  });
  return { clock, raw, ctx, client };
}

describe('sync API', () => {
  it('round-trips changes between two devices and receives server-side imports', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const { secret } = await createToken(server.app, s, ['sync', 'import']);
    const transport = httpTransport(server.app, secret);
    const a = device('device-a', transport, 1);
    const b = device('device-b', transport, 2);

    await ensureCollection(a.ctx, 'fr');
    await applyImport(a.ctx, parseImport(SAMPLE_MARKDOWN, { fileName: 'geo.md' }), {
      mode: 'skip-duplicates',
      targetDeck: 'Import',
      fileName: 'geo.md',
    });
    a.clock.advance(1000);
    const pushed = await a.client.sync();
    expect(pushed.pushed).toBeGreaterThan(0);

    b.clock.advance(2000);
    const pulled = await b.client.sync();
    expect(pulled.pulled).toBeGreaterThan(0);
    expect((await b.raw.notes.list()).map((n) => n.uid).sort()).toEqual(['geo-001', 'geo-002']);

    // An import through the API reaches both devices on their next sync.
    server.clock.advance(5000);
    const imp = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: bearer(secret),
      payload: {
        text: '---\nformat: mnemo/1\n---\n\n@deck Histoire\n\n::: basic uid=his-001\nQ: 1789 ?\nA: Révolution\n:::\n',
        fileName: 'his.md',
      },
    });
    expect(imp.statusCode).toBe(200);
    a.clock.advance(10_000);
    await a.client.sync();
    expect((await a.raw.notes.list()).map((n) => n.uid).sort()).toEqual([
      'geo-001',
      'geo-002',
      'his-001',
    ]);
  });

  it('is idempotent for a replayed batch', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const { secret } = await createToken(server.app, s, ['sync']);
    const transport = httpTransport(server.app, secret);
    const deck = {
      id: '0198a000-0000-7000-8000-000000000001',
      name: 'Replay',
      createdAt: 1,
      updatedAt: 1,
    };
    const req = {
      batchId: 'batch-1',
      deviceId: 'dev',
      changes: [{ kind: 'deck' as const, data: deck }],
    };
    const first = await transport.push(req);
    const second = await transport.push(req);
    expect(second).toEqual(first);
    const page = await transport.pull({ cursor: 0, limit: 100 });
    expect(page.changes.filter((c) => c.kind === 'deck')).toHaveLength(1);
  });

  it('validates push bodies, rejects bad gzip and oversized batches', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const { secret } = await createToken(server.app, s, ['sync']);
    const invalid = await server.app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: bearer(secret),
      payload: { batchId: 'x', deviceId: 'y', changes: [{ kind: 'deck', data: { id: 1 } }] },
    });
    expect(invalid.statusCode).toBe(400);
    const badGzip = await server.app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: {
        ...bearer(secret),
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      },
      payload: Buffer.from('not gzip at all'),
    });
    expect(badGzip.statusCode).toBe(400);
    // 6 MB of JSON compresses to almost nothing but is still refused once inflated.
    const bomb = gzipSync(
      JSON.stringify({
        batchId: 'b',
        deviceId: 'd',
        changes: [],
        pad: 'x'.repeat(6 * 1024 * 1024),
      }),
    );
    const tooBig = await server.app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: {
        ...bearer(secret),
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      },
      payload: bomb,
    });
    expect(tooBig.statusCode).toBe(413);
  });

  it('stores media by verified SHA-256, up to 5 MB', async () => {
    server = await startTestServer({ maxUploadBytes: 20 * 1024 * 1024 });
    const s = await register(server.app);
    const { secret } = await createToken(server.app, s, ['sync']);
    const transport = httpTransport(server.app, secret);
    const bytes = new TextEncoder().encode('fake png bytes');
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(await transport.missingMedia([sha])).toEqual([sha]);
    await transport.uploadMedia(sha, bytes);
    expect(await transport.missingMedia([sha])).toEqual([]);
    expect(Buffer.from((await transport.downloadMedia(sha)) ?? []).toString()).toBe(
      'fake png bytes',
    );

    const mismatch = await server.app.inject({
      method: 'PUT',
      url: `/api/v1/sync/media/${'0'.repeat(64)}`,
      headers: { ...bearer(secret), 'content-type': 'image/png' },
      payload: Buffer.from(bytes),
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: { code: 'hash_mismatch' } });

    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const bigSha = createHash('sha256').update(big).digest('hex');
    const tooBig = await server.app.inject({
      method: 'PUT',
      url: `/api/v1/sync/media/${bigSha}`,
      headers: { ...bearer(secret), 'content-type': 'application/octet-stream' },
      payload: big,
    });
    expect(tooBig.statusCode).toBe(413);
    const badSha = await server.app.inject({
      url: '/api/v1/sync/media/xyz',
      headers: bearer(secret),
    });
    expect(badSha.statusCode).toBe(400);
  });
});
