import type { FastifyError, FastifyInstance } from 'fastify';
import type { z } from 'zod';

/** An error with an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Parses untrusted input with Zod; failures become 400 responses listing the issues. */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(400, 'invalid_input', 'Invalid request', details);
  }
  return r.data;
}

function isFastifyError(e: unknown): e is FastifyError {
  return e instanceof Error && typeof (e as Partial<FastifyError>).statusCode === 'number';
}

/** Uniform JSON errors; internal errors never leak their message. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      const body: ErrorBody = { error: { code: err.code, message: err.message } };
      if (err.details !== undefined) body.error.details = err.details;
      return reply.status(err.statusCode).send(body);
    }
    if (isFastifyError(err) && err.statusCode !== undefined && err.statusCode < 500) {
      const code = err.code.replace(/^FST_/, '').toLowerCase();
      return reply
        .status(err.statusCode)
        .send({ error: { code, message: err.message } } satisfies ErrorBody);
    }
    req.log.error(err);
    return reply
      .status(500)
      .send({ error: { code: 'internal', message: 'Internal server error' } } satisfies ErrorBody);
  });
  app.setNotFoundHandler((_req, reply) =>
    reply
      .status(404)
      .send({ error: { code: 'not_found', message: 'Not found' } } satisfies ErrorBody),
  );
}
