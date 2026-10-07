import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const NO_CACHE = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

/**
 * Serves the built PWA. Hashed files under `assets/` are cached for a year; the entry points
 * (`index.html`, `sw.js`, the manifest) are never cached so updates are picked up. The app uses
 * hash routing, so only `/` needs to resolve to `index.html`.
 */
export async function registerStatic(app: FastifyInstance, webDist: string): Promise<boolean> {
  if (!existsSync(join(webDist, 'index.html'))) {
    app.log.warn({ webDist }, 'Web app not found: only the API is served');
    return false;
  }
  await app.register(fastifyStatic, {
    root: webDist,
    index: ['index.html'],
    wildcard: true,
    cacheControl: false,
    dotfiles: 'deny',
    setHeaders: (res, path) => {
      const name = path.split(/[\\/]/).pop() ?? '';
      if (NO_CACHE.has(name)) {
        res.header('cache-control', 'no-cache');
      } else if (/[\\/]assets[\\/]/.test(path) || /^workbox-[0-9a-f]+\.js$/.test(name)) {
        res.header('cache-control', 'public, max-age=31536000, immutable');
      } else {
        res.header('cache-control', 'public, max-age=3600');
      }
    },
  });
  return true;
}
