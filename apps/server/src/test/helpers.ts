import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { manualClock, type ManualClock } from '@mnemo/core';
import { createServer } from '../app';
import type { ServerConfig } from '../config';
import type { RateLimits } from '../context';

export const PASSWORD = 'correct horse battery staple';

export interface TestServer {
  app: FastifyInstance;
  clock: ManualClock;
  dataDir: string;
  bootstrapInvite?: string;
  close(): Promise<void>;
}

export function testConfig(dataDir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    host: '0.0.0.0',
    dataDir,
    registrationMode: 'open',
    sessionSecret: 'test-secret-test-secret-test-secret-0123',
    maxUploadBytes: 2 * 1024 * 1024,
    corsOrigins: [],
    trustProxy: false,
    noAuth: false,
    secureCookies: false,
    ...overrides,
  };
}

export async function startTestServer(
  overrides: Partial<ServerConfig> = {},
  rateLimits?: Partial<RateLimits>,
  dataDir = mkdtempSync(join(tmpdir(), 'mnemo-server-')),
): Promise<TestServer> {
  const clock = manualClock(Date.UTC(2026, 0, 15, 12));
  const server: TestServer = {
    app: undefined as unknown as FastifyInstance,
    clock,
    dataDir,
    close: async () => {
      await server.app.close();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
  const deps = {
    clock,
    onBootstrapInvite: (code: string) => {
      server.bootstrapInvite = code;
    },
    ...(rateLimits ? { rateLimits } : {}),
  };
  server.app = await createServer(testConfig(dataDir, overrides), deps);
  return server;
}

/** A logged-in browser: session cookie + CSRF token. */
export interface Session {
  cookie: string;
  csrf: string;
  userId: string;
}

export function sessionCookie(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'mnemo_session');
  if (!c) throw new Error(`No session cookie (status ${String(res.statusCode)}): ${res.body}`);
  return c.value;
}

export async function register(
  app: FastifyInstance,
  email = 'alice@example.com',
  extra: Record<string, string> = {},
): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: PASSWORD, ...extra },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const body = res.json<{ user: { id: string }; csrfToken: string }>();
  return { cookie: sessionCookie(res), csrf: body.csrfToken, userId: body.user.id };
}

/** Headers of an authenticated, CSRF-protected browser request. */
export function asSession(s: Session) {
  return { cookies: { mnemo_session: s.cookie }, headers: { 'x-csrf-token': s.csrf } };
}

export async function createToken(
  app: FastifyInstance,
  s: Session,
  scopes: string[],
  name = 'test',
): Promise<{ id: string; secret: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tokens',
    ...asSession(s),
    payload: { name, scopes },
  });
  if (res.statusCode !== 201) throw new Error(`token failed: ${res.body}`);
  const body = res.json<{ token: { id: string }; secret: string }>();
  return { id: body.token.id, secret: body.secret };
}

export const bearer = (secret: string) => ({ authorization: `Bearer ${secret}` });

export const SAMPLE_MARKDOWN = `---
format: mnemo/1
---

@deck Géographie

::: basic uid=geo-001
Q: Capitale de la France ?
A: Paris
:::

::: basic uid=geo-002
Q: Capitale de l'Italie ?
A: Rome
:::
`;
