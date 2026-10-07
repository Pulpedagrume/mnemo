import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/** Default port of `mnemo serve`. */
export const DEFAULT_PORT = 8787;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);

/** True for hosts that only accept connections from this machine. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host);
}

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no', ''])])
  .transform((v) => v === true || v === 'true' || v === '1' || v === 'yes');

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const REGISTRATION_MODES = ['closed', 'invite', 'open'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATA_DIR: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  REGISTRATION_MODE: z.preprocess(emptyToUndefined, z.enum(REGISTRATION_MODES).default('closed')),
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(20),
  /** Comma-separated extra origins allowed by CORS (same origin only by default). */
  CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
  /** `true`, a hop count, or a comma-separated list of proxy addresses (Fastify `trustProxy`). */
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().optional()),
  WEB_DIST: z.preprocess(emptyToUndefined, z.string().optional()),
  NO_AUTH: z.preprocess(emptyToUndefined, boolish.default(false)),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().optional()),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
});
export type ServerEnv = z.input<typeof EnvSchema>;

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  baseUrl?: string;
  registrationMode: RegistrationMode;
  /** Used to sign the session cookie; random per process in single-user localhost mode. */
  sessionSecret?: string;
  maxUploadBytes: number;
  corsOrigins: string[];
  trustProxy: boolean | number | string;
  /** Directory of the built PWA (`apps/web/dist`); not served when undefined. */
  webDist?: string;
  /** Force single-user mode without authentication (loopback hosts only). */
  noAuth: boolean;
  /** Cookies get the `Secure` flag (BASE_URL is https). */
  secureCookies: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (v === undefined || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/** Reads and validates the configuration from environment variables (and CLI overrides). */
export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration: ${details.join('; ')}`);
  }
  const e = parsed.data;
  const config: ServerConfig = {
    port: e.PORT,
    host: e.HOST,
    dataDir: resolve(e.DATA_DIR ?? join(homedir(), '.mnemo')),
    registrationMode: e.REGISTRATION_MODE,
    maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
    corsOrigins: (e.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    noAuth: e.NO_AUTH,
    secureCookies: e.BASE_URL?.startsWith('https://') ?? false,
  };
  if (e.BASE_URL) config.baseUrl = e.BASE_URL.replace(/\/+$/, '');
  if (e.SESSION_SECRET) config.sessionSecret = e.SESSION_SECRET;
  if (e.WEB_DIST) config.webDist = resolve(e.WEB_DIST);
  validateConfig(config);
  return config;
}

/** True when the server is only meant to be reached from this machine (no public BASE_URL). */
export function isLocalOnly(config: ServerConfig): boolean {
  if (!isLoopbackHost(config.host)) return false;
  if (!config.baseUrl) return true;
  return isLoopbackHost(new URL(config.baseUrl).hostname);
}

/** Cross-field rules, also applied to configs built by hand (tests, `mnemo serve`). */
export function validateConfig(config: ServerConfig): void {
  const localOnly = isLocalOnly(config);
  if (config.noAuth && !localOnly) {
    throw new ConfigError(
      `Refusing to start without authentication on a non-loopback host or public URL (${config.baseUrl ?? config.host}). ` +
        'Use HOST=127.0.0.1 without a public BASE_URL, or enable accounts.',
    );
  }
  if (!localOnly && !config.sessionSecret) {
    throw new ConfigError(
      'SESSION_SECRET (at least 32 characters) is required on a public host or behind a public BASE_URL.',
    );
  }
}
