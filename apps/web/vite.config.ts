/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
// Relative import: the config is loaded by Node, which cannot resolve the workspace's TS sources.
import { APP_NAME } from '../../packages/core/src/app.ts';

/** Injects APP_NAME into index.html so a rename touches a single constant. */
function appNamePlugin(): Plugin {
  return {
    name: 'mnemo:app-name',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
  };
}

const SCHEMA_FILE = fileURLToPath(
  new URL('../../schema/mnemo-import.schema.json', import.meta.url),
);
const SCHEMA_PATH = 'schema/mnemo-import.schema.json';

/** Publishes the generated import JSON Schema next to the app (copied at build, served in dev). */
function schemaPlugin(): Plugin {
  return {
    name: 'mnemo:schema',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith(SCHEMA_PATH) || !existsSync(SCHEMA_FILE)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/schema+json');
        res.end(readFileSync(SCHEMA_FILE));
      });
    },
    generateBundle() {
      if (existsSync(SCHEMA_FILE))
        this.emitFile({ type: 'asset', fileName: SCHEMA_PATH, source: readFileSync(SCHEMA_FILE) });
    },
  };
}

export default defineConfig({
  // BASE_PATH allows serving under a sub-path, e.g. /<repo>/ on GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    appNamePlugin(),
    schemaPlugin(),
    VitePWA({
      // Never reload on its own: the app shows a "new version" prompt (see ReloadPrompt).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Spaced repetition with AI-friendly import — works offline.',
        lang: 'fr',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,json}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
