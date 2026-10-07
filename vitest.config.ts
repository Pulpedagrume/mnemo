import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'scripts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/test/**', '**/testing/**'],
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: {
        // The pure domain must stay thoroughly tested (phase 1 acceptance criterion).
        'packages/core/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
