import { readFile } from 'node:fs/promises';

import { expect, test, type Download, type Page } from '@playwright/test';

import {
  CROSS_ORIGIN_URL,
  addDevice,
  decodePng,
  fixtureUrl,
  gotoApp,
  pngDimensions,
  previewControls,
  previewFrames,
  readFrameMetrics,
  setSharedUrl,
  startInspection,
  waitForFrameReady,
} from './helpers';

const SE_WIDTH = 375;
const SE_HEIGHT = 667;
const SE_FILENAME = 'iphone_se_375x667.png';

/** Fixture backdrop color (capture-context.html): rgb(231, 76, 60). */
const BACKDROP_RGB: readonly [number, number, number] = [231, 76, 60];

function rgbAt(
  rgba: Buffer,
  width: number,
  x: number,
  y: number
): [number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
}

function near(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  tolerance = 12
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

async function setup(
  page: Page,
  fixture: 'clean' | 'capture-context' = 'clean'
): Promise<void> {
  await gotoApp(page);
  await setSharedUrl(page, fixtureUrl(fixture));
  await addDevice(page, 'iPhone SE');
  await waitForFrameReady(page);
}

/** Click the capture button and await the resulting download. */
async function captureDownload(page: Page): Promise<Download> {
  const button = previewControls(page).getByRole('button', {
    name: 'Capture screenshot',
  });
  // The button is disabled while a capture is in flight; wait for it to be
  // clickable so repeated captures never race the isBusy guard.
  await expect(button).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  return downloadPromise;
}

async function readCapturedPng(page: Page, download: Download) {
  const buffer = await readFile(await download.path());
  return {
    buffer,
    dimensions: pngDimensions(buffer),
    decoded: await decodePng(page, buffer),
  };
}

/** Step workspace zoom by clicking +/- until each expected label appears. */
async function stepZoom(
  page: Page,
  direction: 'in' | 'out',
  expectedLabels: readonly string[]
): Promise<void> {
  const controls = previewControls(page);
  const zoomLabel = controls.getByText(/^\d+%$/).first();
  const buttonName = direction === 'in' ? 'Zoom in' : 'Zoom out';
  for (const label of expectedLabels) {
    await controls.getByRole('button', { name: buttonName }).click();
    await expect(zoomLabel).toHaveText(label);
  }
}

/** Assert the preview's CSS viewport and iframe geometry are untouched by zoom. */
async function expectFrameUntouchedByZoom(page: Page): Promise<void> {
  const metrics = await readFrameMetrics(page);
  expect(metrics.innerWidth).toBe(SE_WIDTH);
  expect(metrics.innerHeight).toBe(SE_HEIGHT);
  expect(metrics.iframeCssWidth).toBe(SE_WIDTH);
  expect(metrics.iframeCssHeight).toBe(SE_HEIGHT);
}

test.describe('screenshot smoke tests', () => {
  test('same-origin capture downloads a real, decodable PNG at the CSS viewport dimensions', async ({
    page,
  }) => {
    await setup(page);

    const download = await captureDownload(page);
    const png = await readCapturedPng(page, download);

    expect(download.suggestedFilename()).toBe(SE_FILENAME);
    expect(png.dimensions).toEqual({ width: SE_WIDTH, height: SE_HEIGHT });
    expect(png.decoded.width).toBe(SE_WIDTH);
    expect(png.decoded.height).toBe(SE_HEIGHT);

    // The PNG must carry actual page content, not a blank canvas: the clean
    // fixture renders dark text on white, so some pixels must be non-white.
    let contentPixels = 0;
    for (let i = 0; i < png.decoded.rgba.length; i += 4) {
      const r = png.decoded.rgba[i]!;
      const g = png.decoded.rgba[i + 1]!;
      const b = png.decoded.rgba[i + 2]!;
      if (r < 245 || g < 245 || b < 245) contentPixels++;
    }
    expect(contentPixels).toBeGreaterThan(0);

    await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  });

  test('screenshot dimensions are independent of fit/50%/100%/200% workspace zoom', async ({
    page,
  }) => {
    await setup(page);

    // 1) Fit mode (initial).
    const fitDownload = await captureDownload(page);
    expect((await readCapturedPng(page, fitDownload)).dimensions).toEqual({
      width: SE_WIDTH,
      height: SE_HEIGHT,
    });

    // 2) Manual 50%: five 10% steps down from fit (90% -> 50%).
    await stepZoom(page, 'out', ['90%', '80%', '70%', '60%', '50%']);
    await expectFrameUntouchedByZoom(page);
    const p50Download = await captureDownload(page);
    const p50 = await readCapturedPng(page, p50Download);
    expect(p50.dimensions).toEqual({ width: SE_WIDTH, height: SE_HEIGHT });

    // 3) Manual 100%: five steps back up (60% -> 100%).
    await stepZoom(page, 'in', ['60%', '70%', '80%', '90%', '100%']);
    await expectFrameUntouchedByZoom(page);
    const p100Download = await captureDownload(page);
    const p100 = await readCapturedPng(page, p100Download);
    expect(p100.dimensions).toEqual({ width: SE_WIDTH, height: SE_HEIGHT });

    // 4) Manual 200%: ten steps up (110% -> 200%).
    await stepZoom(page, 'in', [
      '110%',
      '120%',
      '130%',
      '140%',
      '150%',
      '160%',
      '170%',
      '180%',
      '190%',
      '200%',
    ]);
    await expectFrameUntouchedByZoom(page);

    // Single-scale guard: at 200% the visual footprint is LINEAR (W*2), while
    // the capture must remain the exact CSS viewport (never W*Z nor W*Z^2).
    const box = await previewFrames(page).nth(0).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(SE_WIDTH * 2, 0);

    const p200Download = await captureDownload(page);
    const p200 = await readCapturedPng(page, p200Download);
    expect(p200.dimensions).toEqual({ width: SE_WIDTH, height: SE_HEIGHT });

    // Every capture keeps the same filename and never the zoomed footprint.
    for (const dl of [fitDownload, p50Download, p100Download, p200Download]) {
      expect(dl.suggestedFilename()).toBe(SE_FILENAME);
    }

    // The engine never writes a transform to the iframe (2E-1.1 single-scale).
    const iframeStyle = await previewFrames(page)
      .nth(0)
      .evaluate((f: HTMLIFrameElement) => f.style.transform);
    expect(iframeStyle).toBe('');
  });

  test('custom viewport capture produces exactly the custom dimensions (1024×768)', async ({
    page,
  }) => {
    await setup(page);

    await previewControls(page)
      .getByLabel('Select device')
      .selectOption({ label: 'Custom viewport...' });

    await page.getByLabel('Custom viewport width').fill('1024');
    await page.getByLabel('Custom viewport height').fill('768');
    await page.getByLabel('Custom viewport height').press('Enter');

    await waitForFrameReady(page);
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(1024);
    expect(metrics.innerHeight).toBe(768);
    expect(metrics.iframeCssWidth).toBe(1024);
    expect(metrics.iframeCssHeight).toBe(768);

    const download = await captureDownload(page);
    const png = await readCapturedPng(page, download);

    // Dimensions come from the computed viewport (1024x768), never the
    // workspace container, zoomed footprint, or browser window (1600x1200).
    expect(png.dimensions).toEqual({ width: 1024, height: 768 });
    expect(png.decoded.width).toBe(1024);
    expect(png.decoded.height).toBe(768);
    expect(download.suggestedFilename()).toBe('custom_1024_768_1024x768.png');
  });

  test('portrait and landscape captures follow the computed viewport', async ({
    page,
  }) => {
    await setup(page);

    const portrait = await captureDownload(page);
    const portraitPng = await readCapturedPng(page, portrait);
    expect(portraitPng.dimensions).toEqual({ width: 375, height: 667 });
    expect(portrait.suggestedFilename()).toBe('iphone_se_375x667.png');

    await previewControls(page)
      .getByRole('button', { name: 'Landscape orientation' })
      .click();
    await waitForFrameReady(page);
    const landscapeMetrics = await readFrameMetrics(page);
    expect(landscapeMetrics.innerWidth).toBe(667);
    expect(landscapeMetrics.innerHeight).toBe(375);

    const landscape = await captureDownload(page);
    const landscapePng = await readCapturedPng(page, landscape);
    expect(landscapePng.dimensions).toEqual({ width: 667, height: 375 });
    expect(landscape.suggestedFilename()).toBe('iphone_se_667x375.png');
  });

  test('capture contains page content and excludes workspace chrome and overlays', async ({
    page,
  }) => {
    await setup(page, 'capture-context');

    // Turn on every viewport tool and the right-hand inspection panel: all of
    // this workspace chrome must stay OUT of the captured page.
    const controls = previewControls(page);
    await controls.getByRole('button', { name: 'Toggle rulers' }).click();
    await controls.getByRole('button', { name: 'Toggle grid overlay' }).click();
    await controls.getByRole('button', { name: 'Toggle safe-area' }).click();
    await controls
      .getByRole('button', { name: 'Toggle viewport info' })
      .click();
    await startInspection(page);

    const download = await captureDownload(page);
    const png = await readCapturedPng(page, download);
    expect(png.dimensions).toEqual({ width: SE_WIDTH, height: SE_HEIGHT });

    const { width, height, rgba } = png.decoded;
    // Sample the four corners: they must be the fixture backdrop color, not
    // workspace chrome (white cards, gray bezel/toolbars, dark rulers).
    const corners: Array<[number, number]> = [
      [4, 4],
      [width - 5, 4],
      [4, height - 5],
      [width - 5, height - 5],
    ];
    for (const [x, y] of corners) {
      expect(near(rgbAt(rgba, width, x, y), BACKDROP_RGB)).toBe(true);
    }

    // The backdrop must dominate: a screenshot of the whole app, an empty
    // canvas, or chrome would be overwhelmingly white/gray instead.
    let backdropPixels = 0;
    let whitePixels = 0;
    const total = width * height;
    for (let i = 0; i < rgba.length; i += 4) {
      const px: [number, number, number] = [
        rgba[i]!,
        rgba[i + 1]!,
        rgba[i + 2]!,
      ];
      if (near(px, BACKDROP_RGB, 12)) backdropPixels++;
      if (near(px, [255, 255, 255], 10)) whitePixels++;
    }
    expect(backdropPixels / total).toBeGreaterThan(0.85);
    expect(whitePixels / total).toBeLessThan(0.1);
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

  test('an unreachable preview is never captured as false success', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await gotoApp(page);
    // Unreachable local address -> Chromium network failure inside the iframe.
    await setSharedUrl(page, 'http://127.0.0.1:1/');
    await addDevice(page, 'iPhone SE');

    // Chromium aliases a failed navigation to an inaccessible (cross-origin)
    // error realm that is indistinguishable from a genuinely loaded
    // cross-origin page (verified via 'load'/'error' event timeline: the
    // failure fires 'load', never 'error', and contentDocument is null).
    // Wait for the instance to reach that loaded state before capturing.
    await expect(
      previewControls(page).getByLabel('Preview status: Ready')
    ).toBeVisible();

    const downloadPromise = page
      .waitForEvent('download', { timeout: 2500 })
      .then((d) => d)
      .catch(() => null);
    await page.getByRole('button', { name: 'Capture screenshot' }).click();

    // Honest contract: no download, no "Captured" label, and the unsupported
    // status is surfaced — never a fabricated blank PNG. A network failure and
    // a real cross-origin target resolve to the same honest "cross-origin"
    // status because the browser exposes identical (unreachable) documents.
    expect(await downloadPromise).toBeNull();
    await expect(page.getByText('Captured', { exact: true })).not.toBeVisible();
    await expect(
      page.getByText('Unavailable (cross-origin)', { exact: true })
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
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
