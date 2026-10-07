import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { APP_NAME, type Clock } from '@mnemo/core';
import { SYNC_PROTOCOL_VERSION } from '@mnemo/sync';
import { randomToken } from './accounts/crypto';
import { AccountStore } from './accounts/store';
import { LOCAL_USER_ID, registerAuthGuard } from './auth/guard';
import { CollectionRegistry } from './collections/registry';
import { isLocalOnly, validateConfig, type ServerConfig } from './config';
import { DEFAULT_RATE_LIMITS, type AppContext, type RateLimits } from './context';
import { registerErrorHandler } from './errors';
import { OPENAPI_DOCUMENT } from './openapi';
import { registerAccountRoutes } from './routes/account';
import { registerAuthRoutes } from './routes/auth';
import { registerCollectionRoutes } from './routes/collection';
import { registerImportRoutes } from './routes/import';
import { registerSyncRoutes } from './routes/sync';
import { registerTokenRoutes } from './routes/tokens';
import { registerSecurity } from './security';
import { registerStatic } from './static';

export const SERVER_VERSION = '0.1.0';

export interface ServerDeps {
  clock: Clock;
  /** Overrides of the rate limits (tests). */
  rateLimits?: Partial<RateLimits>;
  /** Fastify logger option (false in tests). */
  logger?: FastifyServerOptions['logger'];
  /** IANA zone used for study days when the user has not chosen one. */
  timeZone?: string;
  /** Receives the one-time invite that creates the first account (printed by `startServer`). */
  onBootstrapInvite?: (code: string) => void;
}

/** Session-cookie key: SESSION_SECRET, else a random key persisted in DATA_DIR (loopback only). */
function resolveSecret(config: ServerConfig): string {
  if (config.sessionSecret) return config.sessionSecret;
  const file = join(config.dataDir, 'session-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomToken(48);
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/** Fastify takes a hop count as a function. */
function fastifyTrustProxy(v: ServerConfig['trustProxy']) {
  if (typeof v !== 'number') return v;
  return (_address: string, hop: number) => hop < v;
}

/** Builds the Fastify app (routes, security, static files) without listening. */
export async function createServer(
  config: ServerConfig,
  deps: ServerDeps,
): Promise<FastifyInstance> {
  validateConfig(config);
  mkdirSync(config.dataDir, { recursive: true });
  const limits: RateLimits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const accounts = new AccountStore(
    join(config.dataDir, 'accounts.sqlite'),
    resolveSecret(config),
    deps.clock,
  );
  accounts.purgeExpiredSessions();
  // Single-user mode: explicit --no-auth, or a local-only server that has no account yet.
  const singleUser = config.noAuth || (isLocalOnly(config) && accounts.countUsers() === 0);
  if (singleUser) accounts.ensureUser(LOCAL_USER_ID, 'local@localhost', 'admin');

  const ctx: AppContext = {
    config,
    clock: deps.clock,
    accounts,
    collections: new CollectionRegistry(config.dataDir, deps.clock, deps.timeZone ?? 'UTC'),
    singleUser,
    localCsrf: randomToken(24),
    cookieName: config.secureCookies ? '__Host-mnemo_session' : 'mnemo_session',
  };

  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: fastifyTrustProxy(config.trustProxy),
    bodyLimit: config.maxUploadBytes,
  });
  app.addHook('onClose', async () => {
    await ctx.collections.closeAll();
    accounts.close();
  });
  registerErrorHandler(app);
  await registerSecurity(app, config, limits);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 1024 },
  });
  registerAuthGuard(app, {
    accounts,
    cookieName: ctx.cookieName,
    singleUser,
    localCsrf: ctx.localCsrf,
  });

  await app.register(
    (api, _opts, done) => {
      api.get('/health', { config: { auth: { public: true } } }, () => ({
        status: 'ok',
        name: APP_NAME,
        version: SERVER_VERSION,
        syncProtocol: SYNC_PROTOCOL_VERSION,
        auth: singleUser ? 'single-user' : 'accounts',
        registration: singleUser ? 'closed' : config.registrationMode,
      }));
      api.get('/openapi.json', { config: { auth: { public: true } } }, () => OPENAPI_DOCUMENT);
      registerAuthRoutes(api, ctx, limits);
      registerTokenRoutes(api, ctx);
      registerImportRoutes(api, ctx, limits);
      registerCollectionRoutes(api, ctx);
      registerSyncRoutes(api, ctx, limits);
      registerAccountRoutes(api, ctx);
      done();
    },
    { prefix: '/api/v1' },
  );

  if (config.webDist) await registerStatic(app, config.webDist);

  if (!singleUser && accounts.countUsers() === 0) {
    // First start of a server with accounts: a one-time invite creates the admin account.
    const code = randomToken(18);
    accounts.createInvite('bootstrap', code, 7 * 24 * 3600 * 1000);
    deps.onBootstrapInvite?.(code);
  }
  return app;
}
