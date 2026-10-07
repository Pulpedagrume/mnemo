import { DatabaseSync } from 'node:sqlite';
import type { Clock, IdGenerator } from '@mnemo/core';
import { createIdGenerator } from '@mnemo/core';
import {
  ACCOUNTS_DDL,
  AuditRowSchema,
  InviteRowSchema,
  SessionRowSchema,
  TokenRowSchema,
  UserRowSchema,
  type ApiToken,
  type AuditEntry,
  type Scope,
  type User,
} from './schema';
import { cryptoRng, secretHash } from './crypto';

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

function toUser(row: unknown): User | undefined {
  if (row === undefined) return undefined;
  const r = UserRowSchema.parse(row);
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    createdAt: r.created_at,
  };
}

function toToken(row: unknown): ApiToken {
  const r = TokenRowSchema.parse(row);
  const t: ApiToken = {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    createdAt: r.created_at,
  };
  if (r.expires_at !== undefined) t.expiresAt = r.expires_at;
  if (r.revoked_at !== undefined) t.revokedAt = r.revoked_at;
  if (r.last_used_at !== undefined) t.lastUsedAt = r.last_used_at;
  return t;
}

/**
 * Accounts database. Every query is a prepared statement; secrets (session ids, API tokens,
 * invite codes) are only stored as keyed hashes (see `secretHash`).
 */
export class AccountStore {
  private readonly db: DatabaseSync;
  readonly newId: IdGenerator;

  constructor(
    path: string,
    private readonly secret: string,
    private readonly clock: Clock,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
    this.db.exec(ACCOUNTS_DDL);
    this.newId = createIdGenerator(clock, cryptoRng);
  }

  private hash(value: string): string {
    return secretHash(this.secret, value);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  // --- users ---------------------------------------------------------------------------------

  /** Real accounts (the single-user local account is not one). */
  countUsers(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash != '!'").get();
    return Number(row?.n ?? 0);
  }

  createUser(email: string, passwordHash: string, role: User['role']): User {
    const user: User = {
      id: this.newId(),
      email: email.toLowerCase(),
      passwordHash,
      role,
      createdAt: this.clock.now(),
    };
    this.db
      .prepare(
        'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(user.id, user.email, user.passwordHash, user.role, user.createdAt);
    return user;
  }

  /** Inserts a user with a fixed id (the single-user local account). */
  ensureUser(id: string, email: string, role: User['role']): User {
    const existing = this.userById(id);
    if (existing) return existing;
    this.db
      .prepare(
        'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, email, '!', role, this.clock.now());
    return this.userById(id) as User;
  }

  userByEmail(email: string): User | undefined {
    return toUser(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()));
  }

  userById(id: string): User | undefined {
    return toUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }

  deleteUser(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(id);
  }

  // --- sessions ------------------------------------------------------------------------------

  createSession(userId: string, sessionId: string, csrf: string): number {
    const now = this.clock.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .prepare(
        'INSERT INTO sessions (id_hash, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(this.hash(sessionId), userId, csrf, now, expiresAt);
    return expiresAt;
  }

  /** Valid (non-expired) session, or undefined. */
  session(sessionId: string): { userId: string; csrf: string } | undefined {
    const row = this.db
      .prepare('SELECT user_id, csrf, expires_at FROM sessions WHERE id_hash = ?')
      .get(this.hash(sessionId));
    if (!row) return undefined;
    const s = SessionRowSchema.parse(row);
    if (s.expires_at <= this.clock.now()) {
      this.deleteSession(sessionId);
      return undefined;
    }
    return { userId: s.user_id, csrf: s.csrf };
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(this.hash(sessionId));
  }

  purgeExpiredSessions(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.clock.now());
  }

  // --- API tokens ----------------------------------------------------------------------------

  createToken(
    userId: string,
    token: string,
    input: { name: string; scopes: Scope[]; expiresAt?: number },
  ): ApiToken {
    const t: ApiToken = {
      id: this.newId(),
      userId,
      name: input.name,
      prefix: token.slice(0, 12),
      scopes: [...new Set(input.scopes)],
      createdAt: this.clock.now(),
    };
    if (input.expiresAt !== undefined) t.expiresAt = input.expiresAt;
    this.db
      .prepare(
        'INSERT INTO api_tokens (id, user_id, name, hash, prefix, scopes, created_at, expires_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        t.id,
        userId,
        t.name,
        this.hash(token),
        t.prefix,
        JSON.stringify(t.scopes),
        t.createdAt,
        t.expiresAt ?? null,
      );
    return t;
  }

  /** Active token (not revoked, not expired) matching the presented secret. */
  activeToken(token: string): ApiToken | undefined {
    const row = this.db.prepare('SELECT * FROM api_tokens WHERE hash = ?').get(this.hash(token));
    if (!row) return undefined;
    const t = toToken(row);
    const now = this.clock.now();
    if (t.revokedAt !== undefined || (t.expiresAt !== undefined && t.expiresAt <= now)) {
      return undefined;
    }
    this.db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(now, t.id);
    return t;
  }

  listTokens(userId: string): ApiToken[] {
    return this.db
      .prepare('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId)
      .map(toToken);
  }

  revokeToken(userId: string, id: string): boolean {
    const res = this.db
      .prepare(
        'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      )
      .run(this.clock.now(), id, userId);
    return Number(res.changes) > 0;
  }

  // --- invites -------------------------------------------------------------------------------

  createInvite(createdBy: string, code: string, ttlMs: number): number {
    const now = this.clock.now();
    const expiresAt = now + ttlMs;
    this.db
      .prepare(
        'INSERT INTO invites (code_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(this.hash(code), createdBy, now, expiresAt);
    return expiresAt;
  }

  /** True when the code exists, is unused and not expired. */
  inviteUsable(code: string): boolean {
    const row = this.db
      .prepare('SELECT code_hash, expires_at, used_at FROM invites WHERE code_hash = ?')
      .get(this.hash(code));
    if (!row) return false;
    const inv = InviteRowSchema.parse(row);
    return inv.used_at === undefined && inv.expires_at > this.clock.now();
  }

  useInvite(code: string, userId: string): void {
    this.db
      .prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ?')
      .run(userId, this.clock.now(), this.hash(code));
  }

  // --- audit ---------------------------------------------------------------------------------

  audit(userId: string, action: string, detail: unknown): void {
    this.db
      .prepare('INSERT INTO audit_log (id, user_id, at, action, detail) VALUES (?, ?, ?, ?, ?)')
      .run(this.newId(), userId, this.clock.now(), action, JSON.stringify(detail));
  }

  auditLog(userId: string, limit = 100): AuditEntry[] {
    return this.db
      .prepare(
        'SELECT id, at, action, detail FROM audit_log WHERE user_id = ? ORDER BY at DESC LIMIT ?',
      )
      .all(userId, limit)
      .map((row) => {
        const r = AuditRowSchema.parse(row);
        return { id: r.id, at: r.at, action: r.action, detail: JSON.parse(r.detail) as unknown };
      });
  }

  /** Runs `fn` in a write transaction (used for register-with-invite). */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
