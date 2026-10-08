import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from './config';
import type { RateLimits } from './context';
import { ApiError } from './errors';

/**
 * Content Security Policy of the PWA (verified against the Vite build):
 * - scripts: only same-origin files (no inline script, no eval); workers and the service worker
 *   are same-origin files too; `'wasm-unsafe-eval'` only allows compiling WebAssembly (sql.js,
 *   used to read Anki packages), not JavaScript eval;
 * - styles: `'unsafe-inline'` is required because KaTeX emits `style="…"` attributes in the
 *   sanitized HTML of cards and the dialog scroll lock (react-remove-scroll) injects a `<style>`
 *   element. Script execution stays strictly same-origin;
 * - images/media: same origin plus `blob:` (media shown from IndexedDB) and `data:` images.
 */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  mediaSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

export async function registerSecurity(
  app: FastifyInstance,
  config: ServerConfig,
  limits: RateLimits,
): Promise<void> {
  const https = config.secureCookies;
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: https ? { ...CSP_DIRECTIVES, upgradeInsecureRequests: [] } : CSP_DIRECTIVES,
    },
    // HSTS only makes sense (and is only honoured) over HTTPS.
    strictTransportSecurity: https
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  // Same origin only by default; extra origins (e.g. a separately hosted web app) are opt-in.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'content-encoding', 'authorization', 'x-csrf-token'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: limits.global,
    timeWindow: limits.windowMs,
    // Static files of the PWA are not rate limited, only the API.
    allowList: (req) => !req.url.startsWith('/api/'),
    errorResponseBuilder: (_req, ctx) =>
      new ApiError(429, 'rate_limited', `Too many requests, retry in ${ctx.after}`),
  });
}
