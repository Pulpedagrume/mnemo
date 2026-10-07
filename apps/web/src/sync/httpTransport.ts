import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTransport,
} from '@mnemo/sync';

/** How the browser authenticates to the server. */
export type ServerAuth =
  /** Same-origin session cookie (or single-user local server); writes need the CSRF header. */
  | { kind: 'cookie'; csrfToken: string | null }
  /** API token with the `sync` scope (works cross-origin, e.g. from GitHub Pages). */
  | { kind: 'bearer'; token: string };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`HTTP ${String(status)} ${code}`);
    this.name = 'HttpError';
  }
}

function headers(auth: ServerAuth, json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['content-type'] = 'application/json';
  if (auth.kind === 'bearer') h.authorization = `Bearer ${auth.token}`;
  else if (auth.csrfToken) h['x-csrf-token'] = auth.csrfToken;
  return h;
}

/** Calls `/api/v1<path>` on `baseUrl`. */
export async function api<T>(
  baseUrl: string,
  path: string,
  auth: ServerAuth | null,
  init: { method?: string; body?: unknown; raw?: Uint8Array } = {},
): Promise<T> {
  const json = init.body !== undefined;
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
    method: init.method ?? (json || init.raw ? 'POST' : 'GET'),
    credentials: auth?.kind === 'bearer' ? 'omit' : 'include',
    headers: {
      ...(auth ? headers(auth, json) : json ? { 'content-type': 'application/json' } : {}),
      ...(init.raw ? { 'content-type': 'application/octet-stream' } : {}),
    },
    body: json ? JSON.stringify(init.body) : (init.raw as BodyInit | undefined),
  });
  if (!res.ok) {
    let code = 'error';
    try {
      code = ((await res.json()) as { code?: string }).code ?? code;
    } catch {
      // Non-JSON error body.
    }
    throw new HttpError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return (await res.json()) as T;
  return new Uint8Array(await res.arrayBuffer()) as T;
}

/** SyncTransport over the server's `/api/v1/sync/*` routes. */
export function createHttpTransport(baseUrl: string, auth: ServerAuth): SyncTransport {
  return {
    pull: (req: PullRequest) => api<PullResponse>(baseUrl, '/sync/pull', auth, { body: req }),
    push: (req: PushRequest) => api<PushResponse>(baseUrl, '/sync/push', auth, { body: req }),
    missingMedia: async (sha256) =>
      (await api<{ missing: string[] }>(baseUrl, '/sync/media/missing', auth, { body: { sha256 } }))
        .missing,
    uploadMedia: async (sha256, bytes) => {
      await api<undefined>(baseUrl, `/sync/media/${sha256}`, auth, { method: 'PUT', raw: bytes });
    },
    downloadMedia: async (sha256) => {
      try {
        return await api<Uint8Array>(baseUrl, `/sync/media/${sha256}`, auth);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return undefined;
        throw e;
      }
    },
  };
}
