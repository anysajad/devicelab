import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  CROSS_ORIGIN_URL,
  addDevice,
  fixtureUrl,
  gotoApp,
  pngDimensions,
  previewControls,
  previewFrames,
  setSharedUrl,
  waitForFrameReady,
} from './helpers';

async function setup(page: Page): Promise<void> {
  await gotoApp(page);
  await setSharedUrl(page, fixtureUrl('clean'));
  await addDevice(page, 'iPhone SE');
  await waitForFrameReady(page);
}

test.describe('screenshot smoke tests', () => {
  test('same-origin capture downloads a PNG at the CSS viewport dimensions', async ({
    page,
  }) => {
    await setup(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Capture screenshot' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('iphone_se_375x667.png');

    const buffer = await readFile(await download.path());
    expect(pngDimensions(buffer)).toEqual({ width: 375, height: 667 });

    await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  });

  test('cross-origin targets report unavailable and never download a PNG', async ({
    page,
  }) => {
    await gotoApp(page);
    await setSharedUrl(page, `${CROSS_ORIGIN_URL}/fixtures/clean.html`);
    await addDevice(page, 'iPhone SE');
    // Wait on the app's own ready status instead of racing waitForResponse
    // with the navigate-on-add flow (the response resolves before it can be
    // observed).
    await expect(
      previewControls(page).getByLabel('Preview status: Ready')
    ).toBeVisible();

    const downloadPromise = page
      .waitForEvent('download', { timeout: 2500 })
      .then((d) => d)
      .catch(() => null);

    await page.getByRole('button', { name: 'Capture screenshot' }).click();

    expect(await downloadPromise).toBeNull();
    await expect(
      page.getByText('Unavailable (cross-origin)', { exact: true })
    ).toBeVisible();
  });

  test('a preview that has not finished loading reports not ready', async ({
    page,
  }) => {
    await gotoApp(page);

    let releaseScript: (() => void) | undefined;
    await page.route('**/fixtures/pending-lock.js', async (route) => {
      await new Promise<void>((resolve) => {
        releaseScript = resolve;
      });
      await route.continue();
    });

    await setSharedUrl(page, fixtureUrl('pending'));
    await addDevice(page, 'iPhone SE');

    // The parser-blocking script keeps the document in readyState 'loading'.
    await page.waitForFunction(
      () => {
        const frames = document.querySelectorAll(
          'iframe[title="Device preview"]'
        );
        const f = frames[0] as HTMLIFrameElement | undefined;
        if (!f) return false;
        const src = f.getAttribute('src') ?? '';
        if (!src.includes('/fixtures/pending.html')) return false;
        try {
          return f.contentDocument?.readyState === 'loading';
        } catch {
          return false;
        }
      },
      undefined,
      { timeout: 15_000 }
    );

    await page.getByRole('button', { name: 'Capture screenshot' }).click();
    await expect(
      page.getByText('Preview not ready', { exact: true })
    ).toBeVisible();

    // Release the script so the preview finishes loading for a clean teardown.
    releaseScript?.();
    await waitForFrameReady(page);
    await expect(previewFrames(page)).toHaveCount(1);
  });
});
