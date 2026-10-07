import { z } from 'zod';

/** Accounts database (`DATA_DIR/accounts.sqlite`): users, sessions, API tokens, invites, audit. */
export const ACCOUNTS_SCHEMA_VERSION = 1;

export const ACCOUNTS_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS api_tokens_user ON api_tokens(user_id);
CREATE TABLE IF NOT EXISTS invites (
  code_hash TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_user ON audit_log(user_id, at);
`;

export const TOKEN_SCOPES = ['read', 'import', 'sync', 'admin'] as const;
export const ScopeSchema = z.enum(TOKEN_SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

export const ROLES = ['admin', 'user'] as const;

export const UserRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  password_hash: z.string(),
  role: z.enum(ROLES),
  created_at: z.number(),
});

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: (typeof ROLES)[number];
  createdAt: number;
}

export const SessionRowSchema = z.object({
  user_id: z.string(),
  csrf: z.string(),
  expires_at: z.number(),
});

const nullableNumber = z
  .number()
  .nullable()
  .transform((v) => v ?? undefined);

export const TokenRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.string().transform((s, ctx) => {
    const parsed = z.array(ScopeSchema).safeParse(JSON.parse(s));
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid scopes' });
      return z.NEVER;
    }
    return parsed.data;
  }),
  created_at: z.number(),
  expires_at: nullableNumber,
  revoked_at: nullableNumber,
  last_used_at: nullableNumber,
});

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  /** First characters of the token, to recognise it in a list. */
  prefix: string;
  scopes: Scope[];
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
  lastUsedAt?: number;
}

export const InviteRowSchema = z.object({
  code_hash: z.string(),
  expires_at: z.number(),
  used_at: nullableNumber,
});

export const AuditRowSchema = z.object({
  id: z.string(),
  at: z.number(),
  action: z.string(),
  detail: z.string(),
});

export interface AuditEntry {
  id: string;
  at: number;
  action: string;
  detail: unknown;
}
