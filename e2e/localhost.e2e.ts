import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  CROSS_ORIGIN_URL,
  addDevice,
  gotoApp,
  inspectionsPanel,
  previewControls,
  setSharedUrl,
} from './helpers';

/**
 * Localhost / local development foundation (Task 4A).
 *
 * Validates that loopback URLs load in the multi-device preview and that the
 * new diagnostic paths (loopback reachability probe and the toolbar
 * malformed-URL hint) behave honestly in real Chromium.
 *
 * The cross-origin dev server (127.0.0.1:4178) serves the same fixtures as the
 * app server, so `http://127.0.0.1:4178/fixtures/...` is reachable AND a
 * genuinely different origin — which is exactly how a user's `localhost:3000`
 * dev server behaves from DeviceLab.
 */
const crossOriginPort = new URL(CROSS_ORIGIN_URL).port;

/** A server that accepts connections but never responds. */
async function blackholeServer(): Promise<{ server: Server; port: number }> {
  const server = createServer(() => {
    // Accept the connection and hold it open without responding — a
    // deterministic "hanging" target for the load-timeout / probe paths.
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

test('a reachable loopback dev server loads and reports cross-origin inspection', async ({
  page,
}) => {
  await gotoApp(page);
  await setSharedUrl(page, `${CROSS_ORIGIN_URL}/fixtures/clean.html`);
  await addDevice(page, 'iPhone SE');

  await expect(
    previewControls(page).getByLabel('Preview status: Ready')
  ).toBeVisible();

  // Loopback targets are real cross-origin pages: inspection must report the
  // honest "cannot access" state, never claim the DOM was scanned.
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(inspectionsPanel(page)).toBeVisible();
  await expect(
    inspectionsPanel(page).getByText(/cross-origin and cannot be inspected/)
  ).toBeVisible();
});

test('scheme-less localhost URLs default to http and load', async ({
  page,
}) => {
  // 'localhost' resolves to the IPv4 and/or IPv6 loopback stack; which one is
  // reachable varies by platform, so skip cleanly (not fail) when the
  // hostname cannot reach the fixture server in this environment.
  const reachable = await page.request
    .get(`http://localhost:${crossOriginPort}/fixtures/clean.html`)
    .then((r) => r.ok())
    .catch(() => false);
  test.skip(
    !reachable,
    'localhost hostname is not reachable in this environment'
  );

  await gotoApp(page);
  await setSharedUrl(page, `localhost:${crossOriginPort}/fixtures/clean.html`);
  await addDevice(page, 'iPhone SE');

  await expect(
    previewControls(page).getByLabel('Preview status: Ready')
  ).toBeVisible();
});

test('an unreachable loopback dev server surfaces a clear connection error', async ({
  page,
}) => {
  const { server, port } = await blackholeServer();
  try {
    await gotoApp(page);
    await setSharedUrl(page, `http://127.0.0.1:${port}/`);
    await addDevice(page, 'iPhone SE');

    // The loopback probe aborts (~3s) and, because the iframe never loads a
    // document, the error overlay reports the dead server instead of showing
    // Chromium's own error page marked as "Ready".
    await expect(
      page.getByText(
        /Cannot reach 127\.0\.0\.1:\d+ — check that the dev server is running/
      )
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('malformed URLs are flagged in the toolbar without blocking clearing', async ({
  page,
}) => {
  await gotoApp(page);

  const input = page.getByLabel('Shared preview URL');
  await input.fill('this is not a url');
  await input.press('Enter');

  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toContainText(
    "doesn't look like a valid URL"
  );

  // Editing dismisses the warning; submitting a valid URL clears it fully.
  await input.fill('http://localhost:3000');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await input.press('Enter');
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
});
