import { defineConfig, devices } from '@playwright/test';

/**
 * The suite runs against a real build, not the dev server, so what is tested
 * is what ships. `webServer` starts `astro preview` and reuses one that is
 * already up locally, which keeps the loop fast while iterating.
 */
const PORT = 4321;
const BASE = process.env.BASE_PATH ?? '/MoundhalaVerse';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The scene renders on the CPU in CI, which is slow. Budgets below are about
  // correctness, never frame rate, so a generous timeout costs nothing.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}${BASE}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run preview',
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
