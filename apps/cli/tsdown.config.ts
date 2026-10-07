import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship TypeScript sources: bundle them into the CLI (the server of
  // `mnemo serve` included). argon2 is a native addon and stays external.
  deps: { alwaysBundle: [/^@mnemo\//], neverBundle: ['@node-rs/argon2'] },
});
