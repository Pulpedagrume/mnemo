import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeBundle } from '@mnemo/importers';
import { readBackupZip } from '@mnemo/services';
import {
  PASSWORD,
  SAMPLE_MARKDOWN,
  asSession,
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

interface ImportResponse {
  dryRun: boolean;
  imported: boolean;
  batchId: string | null;
  counts: { valid: number; errors: number };
  plan: { counts: { create: number; update: number; skip: number } };
}

interface DeckJson {
  name: string;
  counts: { new: number };
  children: DeckJson[];
}

describe('import', () => {
  it('dry run plans without writing, real import writes and is audited', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const { secret } = await createToken(server.app, s, ['import', 'read']);
    const dry = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: bearer(secret),
      payload: { text: SAMPLE_MARKDOWN, fileName: 'geo.md', dryRun: true },
    });
    expect(dry.statusCode).toBe(200);
    expect(dry.json<ImportResponse>()).toMatchObject({
      dryRun: true,
      imported: false,
      counts: { valid: 2, errors: 0 },
      plan: { counts: { create: 2 } },
    });
    const decksBefore = await server.app.inject({ url: '/api/v1/decks', headers: bearer(secret) });
    expect(decksBefore.json<{ decks: DeckJson[] }>().decks).toEqual([]);

    const real = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: bearer(secret),
      payload: { text: SAMPLE_MARKDOWN, fileName: 'geo.md' },
    });
    expect(real.json<ImportResponse>()).toMatchObject({
      imported: true,
      plan: { counts: { create: 2 } },
    });
    const decks = (
      await server.app.inject({ url: '/api/v1/decks', headers: bearer(secret) })
    ).json<{
      decks: DeckJson[];
    }>().decks;
    const geo = decks.find((d) => d.name === 'Géographie');
    expect(geo?.counts.new).toBe(2);

    // Same file again: duplicates are skipped by uid.
    const again = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: bearer(secret),
      payload: { text: SAMPLE_MARKDOWN, fileName: 'geo.md' },
    });
    expect(again.json<ImportResponse>().plan.counts.skip).toBe(2);

    const audit = await server.app.inject({
      url: '/api/v1/account/audit',
      cookies: { mnemo_session: s.cookie },
    });
    const entries = audit.json<{ entries: { action: string; detail: { dryRun: boolean } }[] }>()
      .entries;
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.action === 'import')).toBe(true);
  });

  it('accepts multipart uploads and zip bundles', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const bytes = Buffer.from(
      await writeBundle({ mainName: 'notes.md', mainText: SAMPLE_MARKDOWN, media: [] }),
    );
    const boundary = '----mnemo';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="dryRun"\r\n\r\ntrue\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pack.zip"\r\n` +
          'Content-Type: application/zip\r\n\r\n',
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      ...asSession(s),
      headers: {
        ...asSession(s).headers,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ImportResponse>()).toMatchObject({ dryRun: true, counts: { valid: 2 } });
  });

  it('rejects invalid options and oversized bodies', async () => {
    server = await startTestServer({ maxUploadBytes: 1024 });
    const s = await register(server.app);
    const bad = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      ...asSession(s),
      payload: { text: 'x', mode: 'explode' },
    });
    expect(bad.statusCode).toBe(400);
    const big = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      ...asSession(s),
      payload: { text: 'x'.repeat(4096) },
    });
    expect(big.statusCode).toBe(413);
  });
});

describe('AI helpers and stats', () => {
  it('builds prompts and serves the JSON Schema without authentication', async () => {
    server = await startTestServer();
    const prompt = await server.app.inject({
      url: '/api/v1/prompts?task=flashcards&format=yaml&lang=en',
    });
    expect(prompt.statusCode).toBe(200);
    expect(prompt.json<{ prompt: string }>().prompt.length).toBeGreaterThan(100);
    const bad = await server.app.inject({ url: '/api/v1/prompts?format=docx' });
    expect(bad.statusCode).toBe(400);
    const schema = await server.app.inject({ url: '/api/v1/schema' });
    expect(schema.json<{ $schema: string }>().$schema).toContain('json-schema.org');
    const openapi = await server.app.inject({ url: '/api/v1/openapi.json' });
    expect(openapi.json<{ openapi: string }>().openapi).toBe('3.1.0');
  });

  it('returns a stats summary for the collection or a deck', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const stats = await server.app.inject({
      url: '/api/v1/stats/summary',
      cookies: { mnemo_session: s.cookie },
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toHaveProperty('totalCards', 0);
    const missing = await server.app.inject({
      url: '/api/v1/stats/summary?deck=nope',
      cookies: { mnemo_session: s.cookie },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('account (GDPR)', () => {
  it('exports a backup zip and deletes the account with its files', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      ...asSession(s),
      payload: { text: SAMPLE_MARKDOWN },
    });
    const exp = await server.app.inject({
      url: '/api/v1/account/export',
      cookies: { mnemo_session: s.cookie },
    });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers['content-type']).toBe('application/zip');
    const backup = await readBackupZip(new Uint8Array(exp.rawPayload));
    expect(backup.data.notes).toHaveLength(2);

    const userFile = join(server.dataDir, 'users', `${s.userId}.sqlite`);
    expect(existsSync(userFile)).toBe(true);
    const wrong = await server.app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      ...asSession(s),
      payload: { password: 'not my password' },
    });
    expect(wrong.statusCode).toBe(401);
    const del = await server.app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      ...asSession(s),
      payload: { password: PASSWORD },
    });
    expect(del.statusCode).toBe(204);
    expect(existsSync(userFile)).toBe(false);
    const me = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: s.cookie },
    });
    expect(me.statusCode).toBe(401);
    const login = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.com', password: PASSWORD },
    });
    expect(login.statusCode).toBe(401);
  });
});

describe('HTTP hardening and static files', () => {
  it('sends security headers and serves the PWA with the right cache policy', async () => {
    server = await startTestServer();
    const web = join(server.dataDir, 'web');
    mkdirSync(join(web, 'assets'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>Mnemo</title>');
    writeFileSync(join(web, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    writeFileSync(join(web, 'assets', 'index-abc123.js'), 'console.log(1)');
    await server.app.close();
    const dataDir = server.dataDir;
    server = await startTestServer({ webDist: web }, undefined, dataDir);

    const index = await server.app.inject({ url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['cache-control']).toBe('no-cache');
    const csp = String(index.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(index.headers['x-content-type-options']).toBe('nosniff');
    expect(index.headers['referrer-policy']).toBe('no-referrer');
    expect(index.headers['strict-transport-security']).toBeUndefined();

    const sw = await server.app.inject({ url: '/sw.js' });
    expect(sw.headers['cache-control']).toBe('no-cache');
    const asset = await server.app.inject({ url: '/assets/index-abc123.js' });
    expect(asset.headers['cache-control']).toContain('immutable');

    const health = await server.app.inject({ url: '/api/v1/health' });
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not allow cross-origin requests by default, only configured origins', async () => {
    server = await startTestServer({ corsOrigins: ['https://app.example.org'] });
    const allowed = await server.app.inject({
      url: '/api/v1/health',
      headers: { origin: 'https://app.example.org' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.org');
    const denied = await server.app.inject({
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
