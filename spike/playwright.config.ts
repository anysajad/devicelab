import { defineConfig } from '@playwright/test';
import { resolve } from 'path';

const SPIKE_COMPANION_PORT = 5199;

/**
 * Playwright config for the spike E2E test.
 * Separate from the main e2e suite.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: '../test-results-spike',
  use: {
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {},
    },
  ],
  webServer: [
    {
      command: `npx tsx ${resolve(import.meta.dirname, 'companion/index.ts')}`,
      port: SPIKE_COMPANION_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        SPIKE_PORT: String(SPIKE_COMPANION_PORT),
      },
    },
  ],
});