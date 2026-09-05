import { defineConfig } from '@playwright/test';

/**
 * DeviceLab E2E validation foundation (Task 2E-1).
 *
 * Role: REAL-BROWSER validation only. Playwright drives Chromium against the
 * Vite dev server to verify the app's existing behavior (preview engine,
 * inspection diagnostics, viewport/orientation/zoom semantics, and screenshot
 * smoke behavior). It is NOT the production screenshot backend (2E-2).
 *
 * Key decisions (see plan):
 * - Chromium only — deterministic layout validation, not browser matrix coverage.
 * - Fixtures live in `public/fixtures/*.html` so the SAME origin serves them in
 *   dev and preview (same-origin is required by the inspection/screenshot
 *   subsystems, which both read iframe.contentDocument).
 * - Spec files are named `*.e2e.ts` (never `*.spec.ts`) so the Vitest include
 *   glob never collects them — vite.config.ts is untouched.
 * - A second dev server on port 4178 validates the honest cross-origin path.
 */

const APP_PORT = 5178;
const CROSS_ORIGIN_PORT = 4178;
export const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
export const CROSS_ORIGIN_URL = `http://127.0.0.1:${CROSS_ORIGIN_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Focused suite: deterministic layout validation, not a large regression net.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    // Fixed outer context viewport sized so preset devices fit beside the 360px
    // diagnostics panel. The DEVICE viewport (inside the iframe) is what tests
    // assert against — this outer size merely stabilizes auto-fit zoom.
    viewport: { width: 1600, height: 1200 },
    // Determinism: revert to light theme, quiet animations.
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      // Chromium defaults, inheriting the stable 1600×1200 context viewport from
      // `use` above (devices['Desktop Chrome'] would override it).
      use: {},
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${APP_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${CROSS_ORIGIN_PORT} --strictPort`,
      url: CROSS_ORIGIN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
