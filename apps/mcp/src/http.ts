import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isLoopbackHost } from '@mnemo/server';

export const DEFAULT_MCP_HOST = '127.0.0.1';
export const DEFAULT_MCP_PORT = 8791;
export const MCP_PATH = '/mcp';
export const TOKEN_ENV = 'MNEMO_MCP_TOKEN';

export interface HttpOptions {
  host?: string;
  port?: number;
  /** Bearer token required on every request; mandatory when `host` is not a loopback address. */
  token?: string;
}

export class HttpConfigError extends Error {
  override name = 'HttpConfigError';
}

export interface HttpHandle {
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_NAMES = new Set(['localhost', '[::1]', '::1']);

/** Hostname of a Host header or Origin URL (without port). */
function hostnameOf(value: string): string {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const isLoopbackName = (name: string) => LOOPBACK_NAMES.has(name) || isLoopbackHost(name);

function sameToken(header: string | undefined, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match?.[1]) return false;
  const given = Buffer.from(match[1].trim());
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function reject(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Reason to refuse a request before it reaches MCP, or undefined when it is acceptable. */
function guard(
  req: IncomingMessage,
  loopback: boolean,
  token?: string,
): [number, string] | undefined {
  const path = (req.url ?? '').split('?')[0];
  if (path !== MCP_PATH) return [404, 'Not found'];
  // DNS rebinding: a loopback server only answers to loopback Host names and origins.
  if (loopback && !isLoopbackName(hostnameOf(req.headers.host ?? ''))) {
    return [403, 'Invalid Host header'];
  }
  const origin = req.headers.origin;
  if (loopback && origin !== undefined && !isLoopbackName(hostnameOf(origin))) {
    return [403, 'Invalid Origin header'];
  }
  if (token !== undefined && !sameToken(req.headers.authorization, token)) {
    return [401, 'Missing or invalid bearer token'];
  }
  if (req.method !== 'POST') return [405, 'Method not allowed (stateless server: POST only)'];
  return undefined;
}

/**
 * Streamable HTTP transport, stateless: every POST gets a fresh server instance from
 * `createServer` (they share the collection and the dry-run store). Bound to 127.0.0.1 by
 * default; binding elsewhere requires a bearer token.
 */
export async function serveHttp(
  createMcpServer: () => McpServer,
  opts: HttpOptions = {},
): Promise<HttpHandle> {
  const host = opts.host ?? DEFAULT_MCP_HOST;
  const loopback = isLoopbackName(host.toLowerCase());
  const token = opts.token !== undefined && opts.token !== '' ? opts.token : undefined;
  if (!loopback && token === undefined) {
    throw new HttpConfigError(
      `Binding to ${host} exposes the collection on the network: set ${TOKEN_ENV} to a long random token.`,
    );
  }
  const http = createServer((req, res) => {
    const refused = guard(req, loopback, token);
    if (refused) {
      reject(res, refused[0], refused[1]);
      return;
    }
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    server
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch(() => {
        if (!res.headersSent) reject(res, 500, 'Internal server error');
      });
  });
  await new Promise<void>((resolve, rejectListen) => {
    http.once('error', rejectListen);
    http.listen(opts.port ?? DEFAULT_MCP_PORT, host, () => {
      resolve();
    });
  });
  const address = http.address() as AddressInfo;
  const shownHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    url: `http://${shownHost}:${String(address.port)}${MCP_PATH}`,
    close: () =>
      new Promise<void>((resolve) => {
        http.closeAllConnections();
        http.close(() => {
          resolve();
        });
      }),
  };
}
