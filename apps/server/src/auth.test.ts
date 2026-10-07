import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import {
  PASSWORD,
  asSession,
  bearer,
  createToken,
  register,
  sessionCookie,
  startTestServer,
  type TestServer,
} from './test/helpers';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('registration modes', () => {
  it('open: anyone can register, the first account is admin', async () => {
    server = await startTestServer({ registrationMode: 'open' });
    const a = await register(server.app, 'a@example.com');
    const b = await register(server.app, 'b@example.com');
    const me = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: a.cookie },
    });
    expect(me.json()).toMatchObject({
      user: { email: 'a@example.com', role: 'admin' },
      via: 'session',
    });
    const meB = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: b.cookie },
    });
    expect(meB.json()).toMatchObject({ user: { role: 'user' } });
    const dup = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'A@example.com', password: PASSWORD },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('closed: only the bootstrap invite creates the first account', async () => {
    server = await startTestServer({ registrationMode: 'closed' });
    const refused = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'x@example.com', password: PASSWORD },
    });
    expect(refused.statusCode).toBe(403);
    expect(server.bootstrapInvite).toBeDefined();
    await register(server.app, 'admin@example.com', { invite: server.bootstrapInvite ?? '' });
    const again = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'y@example.com', password: PASSWORD, invite: server.bootstrapInvite },
    });
    expect(again.statusCode).toBe(403);
  });

  it('invite: an admin invite is single-use', async () => {
    server = await startTestServer({ registrationMode: 'invite' });
    const admin = await register(server.app, 'admin@example.com', {
      invite: server.bootstrapInvite ?? '',
    });
    const inv = await server.app.inject({
      method: 'POST',
      url: '/api/v1/invites',
      ...asSession(admin),
      payload: {},
    });
    expect(inv.statusCode).toBe(201);
    const code = inv.json<{ code: string }>().code;
    await register(server.app, 'friend@example.com', { invite: code });
    const reuse = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'other@example.com', password: PASSWORD, invite: code },
    });
    expect(reuse.statusCode).toBe(403);
    const noInvite = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'other@example.com', password: PASSWORD },
    });
    expect(noInvite.statusCode).toBe(403);
  });

  it('rejects weak passwords and invalid emails', async () => {
    server = await startTestServer();
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_input' } });
  });
});

describe('sessions', () => {
  it('login, me, logout', async () => {
    server = await startTestServer();
    await register(server.app);
    const login = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.com', password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'mnemo_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const session = {
      cookie: sessionCookie(login),
      csrf: login.json<{ csrfToken: string }>().csrfToken,
      userId: '',
    };
    const me = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: session.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ csrfToken: string }>().csrfToken).toBe(session.csrf);
    const out = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      ...asSession(session),
    });
    expect(out.statusCode).toBe(204);
    const after = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: session.cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('wrong password and unknown email give the same 401', async () => {
    server = await startTestServer();
    await register(server.app);
    for (const email of ['alice@example.com', 'nobody@example.com']) {
      const res = await server.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'wrong password!' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'invalid_credentials' } });
    }
  });

  it('rate limits login attempts', async () => {
    server = await startTestServer({}, { login: 3 });
    const attempt = () =>
      server!.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'x@example.com', password: 'wrong password!' },
      });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('sessions expire', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    server.clock.advance(31 * 24 * 3600 * 1000);
    const me = await server.app.inject({
      url: '/api/v1/auth/me',
      cookies: { mnemo_session: s.cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('rejects cookie-authenticated writes without the CSRF token', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const noToken = await server.app.inject({
      method: 'POST',
      url: '/api/v1/tokens',
      cookies: { mnemo_session: s.cookie },
      payload: { name: 'x', scopes: ['read'] },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toMatchObject({ error: { code: 'csrf' } });
    const badToken = await server.app.inject({
      method: 'POST',
      url: '/api/v1/tokens',
      cookies: { mnemo_session: s.cookie },
      headers: { 'x-csrf-token': 'forged' },
      payload: { name: 'x', scopes: ['read'] },
    });
    expect(badToken.statusCode).toBe(403);
  });

  it('marks cookies Secure behind an https BASE_URL', async () => {
    server = await startTestServer({ secureCookies: true, baseUrl: 'https://mnemo.example.org' });
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@example.com', password: PASSWORD },
    });
    const cookie = res.cookies.find((c) => c.name === '__Host-mnemo_session');
    expect(cookie).toMatchObject({ secure: true, httpOnly: true });
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
  });
});

describe('API tokens', () => {
  it('are shown once, listed without secret, scoped and revocable', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const sync = await createToken(server.app, s, ['sync']);
    expect(sync.secret).toMatch(/^mnemo_/);
    const list = await server.app.inject({
      url: '/api/v1/tokens',
      cookies: { mnemo_session: s.cookie },
    });
    expect(list.body).not.toContain(sync.secret);
    expect(list.json<{ tokens: unknown[] }>().tokens).toHaveLength(1);

    // A sync token cannot import, nor manage tokens, but can sync.
    const imp = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: bearer(sync.secret),
      payload: { text: 'Q: a\nA: b', dryRun: true },
    });
    expect(imp.statusCode).toBe(403);
    expect(imp.json()).toMatchObject({ error: { code: 'insufficient_scope' } });
    const mint = await server.app.inject({ url: '/api/v1/tokens', headers: bearer(sync.secret) });
    expect(mint.statusCode).toBe(403);
    const pull = await server.app.inject({
      method: 'POST',
      url: '/api/v1/sync/pull',
      headers: bearer(sync.secret),
      payload: { cursor: 0 },
    });
    expect(pull.statusCode).toBe(200);

    const revoke = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/tokens/${sync.id}`,
      ...asSession(s),
    });
    expect(revoke.statusCode).toBe(204);
    const refused = await server.app.inject({
      method: 'POST',
      url: '/api/v1/sync/pull',
      headers: bearer(sync.secret),
      payload: {},
    });
    expect(refused.statusCode).toBe(401);
  });

  it('expire', async () => {
    server = await startTestServer();
    const s = await register(server.app);
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/tokens',
      ...asSession(s),
      payload: { name: 'short', scopes: ['read'], expiresInDays: 1 },
    });
    const { secret } = res.json<{ secret: string }>();
    expect(
      (await server.app.inject({ url: '/api/v1/decks', headers: bearer(secret) })).statusCode,
    ).toBe(200);
    server.clock.advance(2 * 24 * 3600 * 1000);
    expect(
      (await server.app.inject({ url: '/api/v1/decks', headers: bearer(secret) })).statusCode,
    ).toBe(401);
  });
});

describe('single-user mode', () => {
  it('needs no login on a loopback host but a CSRF token for writes', async () => {
    server = await startTestServer({ host: '127.0.0.1' });
    const health = await server.app.inject({ url: '/api/v1/health' });
    expect(health.json()).toMatchObject({ auth: 'single-user' });
    const me = await server.app.inject({ url: '/api/v1/auth/me' });
    expect(me.statusCode).toBe(200);
    const { csrfToken } = me.json<{ csrfToken: string }>();
    const noCsrf = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      payload: { text: 'Q: a\nA: b', dryRun: true },
    });
    expect(noCsrf.statusCode).toBe(403);
    const ok = await server.app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: { 'x-csrf-token': csrfToken },
      payload: { text: 'Q: a\nA: b', dryRun: true },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('rejects foreign Host headers (DNS rebinding)', async () => {
    server = await startTestServer({ host: '127.0.0.1' });
    const res = await server.app.inject({
      url: '/api/v1/decks',
      headers: { host: 'evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses to start without authentication on a public host', () => {
    expect(() =>
      loadConfig({ HOST: '0.0.0.0', NO_AUTH: 'true', SESSION_SECRET: 'x'.repeat(40) }),
    ).toThrow(/non-loopback/);
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow(/SESSION_SECRET/);
  });

  it('refuses createServer in no-auth mode on a public host', async () => {
    await expect(startTestServer({ noAuth: true, host: '0.0.0.0' })).rejects.toThrow(
      /non-loopback/,
    );
  });
});

describe('single-user mode behind a proxy', () => {
  it('refuses proxied requests', async () => {
    server = await startTestServer({ host: '127.0.0.1' });
    const res = await server.app.inject({
      url: '/api/v1/decks',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'forbidden_proxy' } });
  });

  it('is never chosen when BASE_URL is public', async () => {
    server = await startTestServer({ host: '127.0.0.1', baseUrl: 'https://mnemo.example.org' });
    const health = await server.app.inject({ url: '/api/v1/health' });
    expect(health.json()).toMatchObject({ auth: 'accounts' });
    expect(() =>
      loadConfig({ HOST: '127.0.0.1', NO_AUTH: 'true', BASE_URL: 'https://mnemo.example.org' }),
    ).toThrow(/public URL/);
  });
});
