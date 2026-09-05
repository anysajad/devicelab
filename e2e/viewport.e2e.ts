import { expect, test, type Page } from '@playwright/test';

import {
  addDevice,
  fixtureUrl,
  gotoApp,
  previewControls,
  previewFrames,
  readFrameMetrics,
  setSharedUrl,
  waitForFrameReady,
} from './helpers';

async function setup(page: Page, device = 'iPhone SE'): Promise<void> {
  await gotoApp(page);
  await setSharedUrl(page, fixtureUrl('clean'));
  await addDevice(page, device);
  await waitForFrameReady(page);
}

test.describe('viewport + zoom in a real browser', () => {
  test('preset viewport matches the registry (iPhone SE 375×667)', async ({
    page,
  }) => {
    await setup(page);
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(375);
    expect(metrics.innerHeight).toBe(667);
  });

  test('desktop preset uses the wide viewport (1280×720)', async ({ page }) => {
    await setup(page, 'Desktop 1280');
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(1280);
    expect(metrics.innerHeight).toBe(720);
  });

  test('portrait/landscape toggles swap the iframe viewport', async ({
    page,
  }) => {
    await setup(page);
    expect((await readFrameMetrics(page)).innerWidth).toBe(375);

    await previewControls(page)
      .getByRole('button', { name: 'Landscape orientation' })
      .click();
    // Orientation changes reload the frame — wait for the new document instead
    // of racing it (readFrameMetrics throws while contentDocument is null).
    await waitForFrameReady(page);
    const landscape = await readFrameMetrics(page);
    expect(landscape.innerWidth).toBe(667);
    expect(landscape.innerHeight).toBe(375);

    await previewControls(page)
      .getByRole('button', { name: 'Portrait orientation' })
      .click();
    await waitForFrameReady(page);
    const portrait = await readFrameMetrics(page);
    expect(portrait.innerWidth).toBe(375);
    expect(portrait.innerHeight).toBe(667);
  });

  test('custom viewport drives the iframe dimensions', async ({ page }) => {
    await setup(page);

    await previewControls(page)
      .getByLabel('Select device')
      .selectOption({ label: 'Custom viewport...' });

    await page.getByLabel('Custom viewport width').fill('320');
    await page.getByLabel('Custom viewport height').fill('640');
    await page.getByLabel('Custom viewport height').press('Enter');

    // Dimension changes reload the frame — wait for the new document instead
    // of racing it (readFrameMetrics throws while contentDocument is null).
    await waitForFrameReady(page);
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(320);
    expect(metrics.innerHeight).toBe(640);
  });

  test('zoom steps scale the visual frame LINEARLY and leave CSS pixels untouched (single-scale regression)', async ({
    page,
  }) => {
    await setup(page);
    const controls = previewControls(page);
    const zoomLabel = controls.getByText(/^\d+%$/).first();

    const deviceWidth = 375;
    const deviceHeight = 667;

    // First zoom-in leaves fit mode and enters manual zoom at 110%.
    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('110%');
    // The visual footprint must scale LINEARLY with effectiveZoom (single
    // scaling authority). Under the old double-scale bug the frame painted
    // ~Z² and these exact-magnitude assertions failed.
    const box110 = await previewFrames(page).nth(0).boundingBox();
    expect(box110).not.toBeNull();
    expect(box110!.width).toBeCloseTo(deviceWidth * 1.1, 0);
    expect(box110!.height).toBeCloseTo(deviceHeight * 1.1, 0);

    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('120%');
    const box120 = await previewFrames(page).nth(0).boundingBox();
    expect(box120).not.toBeNull();
    expect(box120!.width).toBeCloseTo(deviceWidth * 1.2, 0);
    expect(box120!.height).toBeCloseTo(deviceHeight * 1.2, 0);

    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('130%');
    const box130 = await previewFrames(page).nth(0).boundingBox();
    expect(box130).not.toBeNull();
    expect(box130!.width).toBeCloseTo(deviceWidth * 1.3, 0);
    expect(box130!.height).toBeCloseTo(deviceHeight * 1.3, 0);

    // 10% steps must move the footprint by exactly 10% of the device width
    // (no compounding multiplication).
    expect(box130!.width - box120!.width).toBeCloseTo(deviceWidth * 0.1, 0);

    await controls.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoomLabel).toHaveText('120%');

    // Zoom is purely visual: the document's CSS viewport never changes.
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(375);
    expect(metrics.innerHeight).toBe(667);
    expect(metrics.iframeCssWidth).toBe(375);
    expect(metrics.iframeCssHeight).toBe(667);

    // Single-scale contract: the engine writes no transform to the iframe;
    // only the frame's scaling container is responsible for zoom.
    const iframeStyle = await previewFrames(page)
      .nth(0)
      .evaluate((f: HTMLIFrameElement) => ({
        transform: f.style.transform,
        transformOrigin: f.style.transformOrigin,
        width: f.style.width,
        height: f.style.height,
      }));
    expect(iframeStyle.transform).toBe('');
    expect(iframeStyle.transformOrigin).toBe('');
    expect(iframeStyle.width).toBe('375px');
    expect(iframeStyle.height).toBe('667px');
  });
});
