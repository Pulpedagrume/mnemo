import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBackupZip } from '@mnemo/services';
import { verifyPassword } from '../accounts/crypto';
import { requireAuth } from '../auth/guard';
import type { AppContext } from '../context';
import { ApiError, parseInput } from '../errors';

const DeleteAccountSchema = z.object({ password: z.string().min(1).max(256) });

/** GDPR routes: full export of the collection, and deletion of the account and its data. */
export function registerAccountRoutes(api: FastifyInstance, app: AppContext): void {
  api.get('/account/export', { config: { auth: { scope: 'read' } } }, async (req, reply) => {
    const auth = requireAuth(req);
    const zip = await app.collections.withLock(auth.userId, (c) => createBackupZip(c.ctx));
    const stamp = new Date(app.clock.now()).toISOString().slice(0, 10);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="mnemo-backup-${stamp}.zip"`)
      .header('cache-control', 'no-store')
      .send(Buffer.from(zip));
  });

  api.get('/account/audit', { config: { auth: { sessionOnly: true } } }, (req) => {
    const auth = requireAuth(req);
    return { entries: app.accounts.auditLog(auth.userId) };
  });

  api.delete('/account', { config: { auth: { sessionOnly: true } } }, async (req, reply) => {
    const auth = requireAuth(req);
    if (auth.via === 'local') {
      throw new ApiError(403, 'single_user', 'The local account cannot be deleted');
    }
    const body = parseInput(DeleteAccountSchema, req.body);
    const user = app.accounts.userById(auth.userId);
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      throw new ApiError(401, 'invalid_credentials', 'Wrong password');
    }
    await app.collections.destroy(user.id);
    // Sessions, tokens and audit entries go with the user (ON DELETE CASCADE + explicit purge).
    app.accounts.deleteUser(user.id);
    void reply.clearCookie(app.cookieName, { path: '/' });
    return reply.status(204).send();
  });
}
