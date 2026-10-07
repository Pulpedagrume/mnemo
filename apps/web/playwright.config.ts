import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Self-hosted server (single-user local mode) serving the same web build, for sync tests. */
export const SERVER_PORT = 8790;
const SERVER_DATA = `../../.e2e-data/run-${String(Date.now())}`;

export default defineConfig({
  testDir: './e2e',
  // README screenshots run only through `pnpm screenshots`.
  grepInvert: process.env.SCREENSHOTS ? undefined : /@screenshots/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `pnpm exec vite build && pnpm exec vite preview --port ${String(PORT)} --strictPort`,
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Its own web build (dist-server) avoids racing the preview build above.
      command:
        'pnpm exec vite build --outDir dist-server && pnpm --filter @mnemo/server build && node ../server/dist/server.mjs',
      url: `http://127.0.0.1:${String(SERVER_PORT)}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: SERVER_DATA,
        WEB_DIST: './dist-server',
        NO_AUTH: 'true',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});
