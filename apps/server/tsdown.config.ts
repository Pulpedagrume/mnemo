import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { server: 'src/main.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship TypeScript sources and the npm dependencies are pure JS: bundle them
  // so `dist/server.mjs` runs on its own. argon2 is a native addon and stays external.
  deps: {
    alwaysBundle: [/^@mnemo\//, /^@fastify\//, /^fastify/, /^zod/],
    neverBundle: ['@node-rs/argon2'],
  },
});
