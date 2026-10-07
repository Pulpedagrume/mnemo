import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship TypeScript sources: bundle them into the CLI.
  deps: { alwaysBundle: [/^@mnemo\//] },
});
