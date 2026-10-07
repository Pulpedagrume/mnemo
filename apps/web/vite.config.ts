/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Relative import: the config is loaded by Node, which cannot resolve the workspace's TS sources.
import { APP_NAME } from '../../packages/core/src/app.ts';

/** Injects APP_NAME into index.html so a rename touches a single constant. */
function appNamePlugin(): Plugin {
  return {
    name: 'mnemo:app-name',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
  };
}

export default defineConfig({
  // BASE_PATH allows serving under a sub-path, e.g. /<repo>/ on GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), appNamePlugin()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
