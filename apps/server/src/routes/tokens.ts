import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { newApiToken } from '../accounts/crypto';
import { ScopeSchema, type ApiToken } from '../accounts/schema';
import { requireAuth } from '../auth/guard';
import type { AppContext } from '../context';
import { ApiError, parseInput } from '../errors';

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(ScopeSchema).min(1).max(4),
  /** Lifetime in days; no expiry when omitted. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
const TokenIdSchema = z.object({ id: z.string().min(1).max(64) });

function publicToken(t: ApiToken) {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scopes: t.scopes,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt ?? null,
    revokedAt: t.revokedAt ?? null,
    lastUsedAt: t.lastUsedAt ?? null,
  };
}

/** API token management. Only cookie sessions may manage tokens (a token cannot mint tokens). */
export function registerTokenRoutes(api: FastifyInstance, app: AppContext): void {
  const sessionOnly = { auth: { sessionOnly: true } };

  api.get('/tokens', { config: sessionOnly }, (req) => {
    const auth = requireAuth(req);
    return { tokens: app.accounts.listTokens(auth.userId).map(publicToken) };
  });

  api.post('/tokens', { config: sessionOnly }, (req, reply) => {
    const auth = requireAuth(req);
    const body = parseInput(CreateTokenSchema, req.body);
    if (body.scopes.includes('admin') && app.accounts.userById(auth.userId)?.role !== 'admin') {
      throw new ApiError(403, 'admin_required', 'Only administrators can create admin tokens');
    }
    const secret = newApiToken();
    const input: { name: string; scopes: typeof body.scopes; expiresAt?: number } = {
      name: body.name,
      scopes: body.scopes,
    };
    if (body.expiresInDays !== undefined) {
      input.expiresAt = app.clock.now() + body.expiresInDays * 24 * 3600 * 1000;
    }
    const token = app.accounts.createToken(auth.userId, secret, input);
    // The secret is shown once; only its hash is stored.
    return reply.status(201).send({ token: publicToken(token), secret });
  });

  api.delete('/tokens/:id', { config: sessionOnly }, (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parseInput(TokenIdSchema, req.params);
    if (!app.accounts.revokeToken(auth.userId, id)) {
      throw new ApiError(404, 'not_found', 'Token not found or already revoked');
    }
    return reply.status(204).send();
  });
}
