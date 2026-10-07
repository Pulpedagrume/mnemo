import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { dummyPasswordHash, hashPassword, randomToken, verifyPassword } from '../accounts/crypto';
import { SESSION_TTL_MS } from '../accounts/store';
import { requireAuth } from '../auth/guard';
import type { AppContext, RateLimits } from '../context';
import { ApiError, parseInput } from '../errors';

const EmailSchema = z.email().max(254);
/** Long passphrases welcome; the upper bound keeps argon2 cost bounded. */
export const PasswordSchema = z.string().min(10).max(256);

const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  invite: z.string().min(8).max(128).optional(),
});
const LoginSchema = z.object({ email: EmailSchema, password: z.string().min(1).max(256) });
const InviteSchema = z.object({
  ttlHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
});

export function setSessionCookie(app: AppContext, reply: FastifyReply, sessionId: string): void {
  void reply.setCookie(app.cookieName, sessionId, {
    httpOnly: true,
    secure: app.config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function startSession(app: AppContext, reply: FastifyReply, userId: string) {
  const sessionId = randomToken(32);
  const csrf = randomToken(24);
  app.accounts.createSession(userId, sessionId, csrf);
  setSessionCookie(app, reply, sessionId);
  return csrf;
}

/** May this registration proceed? Throws otherwise. Returns whether an invite is consumed. */
function checkRegistration(app: AppContext, invite: string | undefined): boolean {
  if (app.singleUser) {
    throw new ApiError(403, 'single_user', 'Accounts are disabled in single-user mode');
  }
  const mode = app.config.registrationMode;
  const firstAccount = app.accounts.countUsers() === 0;
  if (invite !== undefined) {
    // Closed servers only accept the bootstrap invite printed at startup (first account).
    if ((mode === 'closed' && !firstAccount) || !app.accounts.inviteUsable(invite)) {
      throw new ApiError(403, 'invalid_invite', 'Invalid or expired invite');
    }
    return true;
  }
  if (mode !== 'open') throw new ApiError(403, 'registration_closed', 'Registration is closed');
  return false;
}

export function registerAuthRoutes(api: FastifyInstance, app: AppContext, limits: RateLimits) {
  const window = limits.windowMs;

  api.post(
    '/auth/register',
    { config: { auth: { public: true }, rateLimit: { max: limits.register, timeWindow: window } } },
    async (req, reply) => {
      const body = parseInput(RegisterSchema, req.body);
      const consumeInvite = checkRegistration(app, body.invite);
      if (app.accounts.userByEmail(body.email)) {
        throw new ApiError(409, 'email_taken', 'An account already exists for this email');
      }
      const hash = await hashPassword(body.password);
      const user = app.accounts.transaction(() => {
        const role = app.accounts.countUsers() === 0 ? 'admin' : 'user';
        const u = app.accounts.createUser(body.email, hash, role);
        if (consumeInvite && body.invite) app.accounts.useInvite(body.invite, u.id);
        return u;
      });
      const csrfToken = startSession(app, reply, user.id);
      return reply.status(201).send({
        user: { id: user.id, email: user.email, role: user.role },
        csrfToken,
      });
    },
  );

  api.post(
    '/auth/login',
    { config: { auth: { public: true }, rateLimit: { max: limits.login, timeWindow: window } } },
    async (req, reply) => {
      const body = parseInput(LoginSchema, req.body);
      const user = app.accounts.userByEmail(body.email);
      // Verify against a dummy hash for unknown emails so timing does not reveal accounts.
      const ok = await verifyPassword(
        user?.passwordHash ?? (await dummyPasswordHash()),
        body.password,
      );
      if (!user || !ok) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password');
      const csrfToken = startSession(app, reply, user.id);
      return { user: { id: user.id, email: user.email, role: user.role }, csrfToken };
    },
  );

  api.post('/auth/logout', { config: { auth: { sessionOnly: true } } }, (req, reply) => {
    const auth = requireAuth(req);
    if (auth.sessionId) app.accounts.deleteSession(auth.sessionId);
    void reply.clearCookie(app.cookieName, { path: '/' });
    return reply.status(204).send();
  });

  api.get('/auth/me', (req) => {
    const auth = requireAuth(req);
    const user = app.accounts.userById(auth.userId);
    if (!user) throw new ApiError(401, 'unauthenticated', 'Account not found');
    return {
      user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
      via: auth.via,
      scopes: auth.scopes === 'all' ? 'all' : [...auth.scopes],
      csrfToken: auth.csrf ?? null,
      mode: app.singleUser ? 'single-user' : 'accounts',
    };
  });

  api.post('/invites', { config: { auth: { scope: 'admin' } } }, (req, reply) => {
    const auth = requireAuth(req);
    if (app.accounts.userById(auth.userId)?.role !== 'admin') {
      throw new ApiError(403, 'admin_required', 'Only administrators can invite');
    }
    const body = parseInput(InviteSchema, req.body ?? {});
    const code = randomToken(18);
    const expiresAt = app.accounts.createInvite(auth.userId, code, body.ttlHours * 3600 * 1000);
    return reply.status(201).send({ code, expiresAt });
  });
}
