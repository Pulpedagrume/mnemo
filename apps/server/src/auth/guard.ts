import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccountStore } from '../accounts/store';
import { API_TOKEN_PREFIX, safeEqual } from '../accounts/crypto';
import type { Scope } from '../accounts/schema';
import { ApiError } from '../errors';

export const LOCAL_USER_ID = 'local';
export const CSRF_HEADER = 'x-csrf-token';

export interface AuthContext {
  userId: string;
  via: 'session' | 'token' | 'local';
  /** Token scopes; sessions and the local user have every scope. */
  scopes: ReadonlySet<Scope> | 'all';
  /** Session id (cookie value) when authenticated by cookie. */
  sessionId?: string;
  /** Token the client must echo in `x-csrf-token` on state-changing requests. */
  csrf?: string;
}

/** Per-route requirements, declared in the route `config`. */
export interface RouteAuthConfig {
  /** No authentication needed (health, login, register, schema…). */
  public?: boolean;
  /** Scope an API token must hold. */
  scope?: Scope;
  /** Only sessions (never API tokens), e.g. token management and account deletion. */
  sessionOnly?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyContextConfig {
    auth?: RouteAuthConfig;
  }
}

export interface GuardOptions {
  accounts: AccountStore;
  cookieName: string;
  /** Single-user mode: every request is the local user. */
  singleUser: boolean;
  /** CSRF token of the single-user mode (per process). */
  localCsrf: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1];
}

function resolveAuth(req: FastifyRequest, o: GuardOptions): AuthContext | undefined {
  if (o.singleUser) {
    return { userId: LOCAL_USER_ID, via: 'local', scopes: 'all', csrf: o.localCsrf };
  }
  const token = bearer(req);
  if (token !== undefined) {
    if (!token.startsWith(API_TOKEN_PREFIX)) return undefined;
    const t = o.accounts.activeToken(token);
    return t ? { userId: t.userId, via: 'token', scopes: new Set(t.scopes) } : undefined;
  }
  const sid = req.cookies[o.cookieName];
  if (!sid) return undefined;
  const s = o.accounts.session(sid);
  return s
    ? { userId: s.userId, via: 'session', scopes: 'all', sessionId: sid, csrf: s.csrf }
    : undefined;
}

export function hasScope(auth: AuthContext, scope: Scope): boolean {
  return auth.scopes === 'all' || auth.scopes.has(scope) || auth.scopes.has('admin');
}

/** Resolves the caller of every `/api` request and enforces the route's auth config. */
export function registerAuthGuard(app: FastifyInstance, o: GuardOptions): void {
  app.addHook('onRequest', (req: FastifyRequest, _reply: FastifyReply, done) => {
    if (!req.url.startsWith('/api/')) {
      done();
      return;
    }
    try {
      checkRequest(req, o);
      done();
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function checkRequest(req: FastifyRequest, o: GuardOptions): void {
  if (o.singleUser) {
    // DNS rebinding protection: in single-user mode only local host names are accepted.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!LOCAL_HOSTNAMES.has(host)) throw new ApiError(403, 'forbidden_host', 'Host not allowed');
    // A reverse proxy in front of a password-less server would publish it: refuse proxied calls.
    if (req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined) {
      throw new ApiError(
        403,
        'forbidden_proxy',
        'Single-user mode is not reachable through a proxy',
      );
    }
  }
  const auth = resolveAuth(req, o);
  if (auth) req.auth = auth;
  const cfg = req.routeOptions.config.auth ?? {};
  if (!auth) {
    if (cfg.public) return;
    throw new ApiError(401, 'unauthenticated', 'Authentication required');
  }
  if (cfg.sessionOnly && auth.via === 'token') {
    throw new ApiError(403, 'session_required', 'This route is not available to API tokens');
  }
  if (cfg.scope && !hasScope(auth, cfg.scope)) {
    throw new ApiError(403, 'insufficient_scope', `Token scope "${cfg.scope}" required`);
  }
  // Cookie (and local) callers must echo their CSRF token on state-changing requests.
  if (auth.via !== 'token' && !SAFE_METHODS.has(req.method) && !cfg.public) {
    const sent = req.headers[CSRF_HEADER];
    if (typeof sent !== 'string' || !auth.csrf || !safeEqual(sent, auth.csrf)) {
      throw new ApiError(403, 'csrf', 'Missing or invalid CSRF token');
    }
  }
}

/** Authenticated caller of a protected route (the guard already rejected anonymous calls). */
export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new ApiError(401, 'unauthenticated', 'Authentication required');
  return req.auth;
}
