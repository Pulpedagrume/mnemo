/**
 * Hand-written OpenAPI 3.1 description of `/api/v1`, served at `/api/v1/openapi.json`.
 * Request bodies are validated by the Zod schemas of the route modules; keep both in sync.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json): Json => ({ 'application/json': { schema } });
const ok = (description: string, schema: Json = { type: 'object' }): Json => ({
  '200': { description, content: json(schema) },
});
const body = (schema: Json): Json => ({ required: true, content: json(schema) });
const query = (name: string, schema: Json, description = ''): Json => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
});
const sha = {
  name: 'sha256',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[a-f0-9]{64}$' },
};

function op(summary: string, extra: Record<string, Json>, scope?: string): Json {
  const security: Json =
    scope === 'session' ? [{ session: [] }] : [{ session: [] }, { bearer: [scope ?? 'read'] }];
  return { summary, ...(scope ? { security } : {}), ...extra };
}

export const OPENAPI_DOCUMENT: Json = {
  openapi: '3.1.0',
  info: {
    title: 'Mnemo API',
    version: '1',
    description:
      'Self-hosted Mnemo server. Authenticate with the session cookie (send `x-csrf-token` from ' +
      '`/auth/me` on state-changing requests) or with `Authorization: Bearer mnemo_…` API tokens.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      session: { type: 'apiKey', in: 'cookie', name: 'mnemo_session' },
      bearer: {
        type: 'http',
        scheme: 'bearer',
        description: 'API token (scopes: read, import, sync, admin)',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
            required: ['code', 'message'],
          },
        },
      },
      Credentials: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 10, maxLength: 256 },
          invite: { type: 'string' },
        },
        required: ['email', 'password'],
      },
      ImportJson: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          fileName: { type: 'string' },
          mode: { enum: ['add', 'skip-duplicates', 'update', 'replace-deck'] },
          targetDeck: { type: 'string' },
          dryRun: { type: 'boolean' },
          lang: { enum: ['fr', 'en'] },
        },
        required: ['text'],
      },
      TokenCreate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          scopes: { type: 'array', items: { enum: ['read', 'import', 'sync', 'admin'] } },
          expiresInDays: { type: 'integer', minimum: 1 },
        },
        required: ['name', 'scopes'],
      },
      PullRequest: {
        type: 'object',
        properties: { cursor: { type: 'integer' }, limit: { type: 'integer', maximum: 5000 } },
      },
      PushRequest: {
        type: 'object',
        properties: {
          batchId: { type: 'string' },
          deviceId: { type: 'string' },
          changes: { type: 'array', items: { type: 'object' } },
        },
        required: ['batchId', 'deviceId', 'changes'],
      },
    },
  },
  paths: {
    '/health': { get: op('Liveness and server mode', { responses: ok('Server status') }) },
    '/openapi.json': { get: op('This document', { responses: ok('OpenAPI document') }) },
    '/auth/register': {
      post: op('Create an account (REGISTRATION_MODE, invite)', {
        requestBody: body(ref('Credentials')),
        responses: { '201': { description: 'Account created, session cookie set' } },
      }),
    },
    '/auth/login': {
      post: op('Open a session', {
        requestBody: body(ref('Credentials')),
        responses: ok('Session cookie set'),
      }),
    },
    '/auth/logout': {
      post: op(
        'Close the session',
        { responses: { '204': { description: 'Logged out' } } },
        'session',
      ),
    },
    '/auth/me': {
      get: op('Current user and CSRF token', { responses: ok('Current user') }, 'read'),
    },
    '/invites': {
      post: op(
        'Create an invite (admin)',
        { responses: { '201': { description: 'Invite code' } } },
        'admin',
      ),
    },
    '/tokens': {
      get: op('List API tokens', { responses: ok('Tokens') }, 'session'),
      post: op(
        'Create an API token (secret shown once)',
        {
          requestBody: body(ref('TokenCreate')),
          responses: { '201': { description: 'Token and secret' } },
        },
        'session',
      ),
    },
    '/tokens/{id}': {
      delete: op(
        'Revoke a token',
        {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'Revoked' } },
        },
        'session',
      ),
    },
    '/import': {
      post: op(
        'Import notes (multipart `file` or JSON); dryRun only plans',
        {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: ref('ImportJson') },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
          responses: ok('Counts, plan and validation report'),
        },
        'import',
      ),
    },
    '/decks': { get: op('Deck tree with today counts', { responses: ok('Decks') }, 'read') },
    '/stats/summary': {
      get: op(
        'Statistics summary',
        { parameters: [query('deck', { type: 'string' }, 'Deck id')], responses: ok('Stats') },
        'read',
      ),
    },
    '/prompts': {
      get: op('Build an AI prompt', {
        parameters: [
          query('task', { type: 'string' }),
          query('format', { enum: ['markdown', 'yaml', 'json', 'csv'] }),
          query('lang', { enum: ['fr', 'en'] }),
          query('deck', { type: 'string' }),
          query('level', { type: 'string' }),
          query('density', { type: 'string' }),
        ],
        responses: ok('Prompt text and metadata'),
      }),
    },
    '/schema': {
      get: op('JSON Schema of the mnemo/1 import format', { responses: ok('JSON Schema') }),
    },
    '/sync/pull': {
      post: op(
        'Pull changes after a cursor',
        { requestBody: body(ref('PullRequest')), responses: ok('Changes') },
        'sync',
      ),
    },
    '/sync/push': {
      post: op(
        'Push a batch of changes (≤ 5 MB, gzip accepted, idempotent by batchId)',
        {
          requestBody: body(ref('PushRequest')),
          responses: ok('Applied count and cursor'),
        },
        'sync',
      ),
    },
    '/sync/media/missing': {
      post: op(
        'Which media contents the server lacks',
        { responses: ok('Missing hashes') },
        'sync',
      ),
    },
    '/sync/media/{sha256}': {
      put: op(
        'Upload a media content (≤ 5 MB, hash verified)',
        { parameters: [sha], responses: { '204': { description: 'Stored' } } },
        'sync',
      ),
      get: op(
        'Download a media content',
        { parameters: [sha], responses: { '200': { description: 'Bytes' } } },
        'sync',
      ),
    },
    '/account/export': {
      get: op(
        'Full backup zip (GDPR export)',
        { responses: { '200': { description: 'application/zip' } } },
        'read',
      ),
    },
    '/account/audit': { get: op('Import audit log', { responses: ok('Entries') }, 'session') },
    '/account': {
      delete: op(
        'Delete the account and all its data (password required)',
        {
          requestBody: body({
            type: 'object',
            properties: { password: { type: 'string' } },
            required: ['password'],
          }),
          responses: { '204': { description: 'Deleted' } },
        },
        'session',
      ),
    },
  },
};
