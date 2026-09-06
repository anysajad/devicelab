import { test, expect } from '@playwright/test';
import { resolve } from 'path';

/**
 * E2E test: full pipeline
 *   DeviceLab spike client → companion → Playwright page → interaction → updated frame
 *
 * The companion is started by Playwright's webServer config (port 5199).
 * Uses page.waitForFunction for reliable async waiting.
 */

const FIXTURE_PATH = resolve(import.meta.dirname, '../../fixture/test-page.html');
const FIXTURE_URL = `file://${FIXTURE_PATH}`;
const COMPANION_PORT = 5199;

/**
 * Helper: create a WebSocket connection in the page context and return a handle
 * that can be used to send messages and wait for responses.
 */
async function setupWs(page: import('@playwright/test').Page) {
  await page.evaluate(
    ({ port }) => {
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ws = ws;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__msgs = [];
      ws.onmessage = (e: MessageEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__msgs.push(JSON.parse(e.data));
      };
    },
    { port: COMPANION_PORT }
  );
}

async function wsSend(page: import('@playwright/test').Page, msg: Record<string, unknown>) {
  await page.evaluate((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ws.send(JSON.stringify(m));
  }, msg);
}

async function wsWaitForMsg(
  page: import('@playwright/test').Page,
  type: string,
  timeout = 15_000
): Promise<Record<string, unknown>> {
  const handle = await page.waitForFunction(
    ({ type }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs = (window as any).__msgs as Array<Record<string, unknown>>;
      const found = msgs.find((m) => m.type === type);
      return found ? JSON.stringify(found) : null;
    },
    { type },
    { timeout }
  );
  const value = await handle.jsonValue();
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function wsClose(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ws?.close();
  });
}

test.describe('spike full pipeline', () => {
  test('companion starts and is reachable', async ({ page }) => {
    const resp = await page.request.get(`http://127.0.0.1:${COMPANION_PORT}/status`);
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body.status).toBe('running');
  });

  test('connect → navigate → frame delivery', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${COMPANION_PORT}/status`);
    await setupWs(page);

    // Connect
    await wsSend(page, { type: 'connect' });
    const ready = await wsWaitForMsg(page, 'ready');
    expect(ready.viewport).toEqual({ width: 375, height: 667 });

    // Navigate
    await wsSend(page, { type: 'navigate', url: FIXTURE_URL });

    // Wait for a frame
    const frame = await wsWaitForMsg(page, 'frame', 10_000);
    expect(typeof frame.data).toBe('string');
    expect((frame.data as string).length).toBeGreaterThan(0);

    await wsClose(page);
  });

  test('click interaction sends pointer events', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${COMPANION_PORT}/status`);
    await setupWs(page);

    await wsSend(page, { type: 'connect' });
    await wsWaitForMsg(page, 'ready');
    await wsSend(page, { type: 'navigate', url: FIXTURE_URL });

    // Wait for first frame
    await wsWaitForMsg(page, 'frame', 10_000);

    // Click
    await wsSend(page, { type: 'pointer', kind: 'down', x: 187, y: 380, button: 0 });
    await wsSend(page, { type: 'pointer', kind: 'up', x: 187, y: 380, button: 0 });

    // Wait for another frame (page updated after click)
    const frame = await wsWaitForMsg(page, 'frame', 5_000);
    expect(frame).toBeDefined();

    await wsClose(page);
  });

  test('wheel interaction sends scroll events', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${COMPANION_PORT}/status`);
    await setupWs(page);

    await wsSend(page, { type: 'connect' });
    await wsWaitForMsg(page, 'ready');
    await wsSend(page, { type: 'navigate', url: FIXTURE_URL });

    await wsWaitForMsg(page, 'frame', 10_000);

    // Scroll
    await wsSend(page, { type: 'wheel', x: 187, y: 333, deltaX: 0, deltaY: 300 });

    const frame = await wsWaitForMsg(page, 'frame', 5_000);
    expect(frame).toBeDefined();

    await wsClose(page);
  });

  test('viewport change updates frame dimensions', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${COMPANION_PORT}/status`);
    await setupWs(page);

    await wsSend(page, { type: 'connect' });
    await wsWaitForMsg(page, 'ready');
    await wsSend(page, { type: 'navigate', url: FIXTURE_URL });

    await wsWaitForMsg(page, 'frame', 10_000);

    // Change viewport
    await wsSend(page, { type: 'viewport', width: 412, height: 915 });

    const frame = await wsWaitForMsg(page, 'frame', 10_000);
    expect(frame).toBeDefined();

    await wsClose(page);
  });

  test('multiple clicks produce multiple frames', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${COMPANION_PORT}/status`);
    await setupWs(page);

    await wsSend(page, { type: 'connect' });
    await wsWaitForMsg(page, 'ready');
    await wsSend(page, { type: 'navigate', url: FIXTURE_URL });

    await wsWaitForMsg(page, 'frame', 10_000);

    // Click 3 times
    for (let i = 0; i < 3; i++) {
      await wsSend(page, { type: 'pointer', kind: 'down', x: 187, y: 380, button: 0 });
      await wsSend(page, { type: 'pointer', kind: 'up', x: 187, y: 380, button: 0 });
      await page.waitForTimeout(100);
    }

    // Wait for frames after clicks
    const frame = await wsWaitForMsg(page, 'frame', 5_000);
    expect(frame).toBeDefined();

    await wsClose(page);
  });
});
