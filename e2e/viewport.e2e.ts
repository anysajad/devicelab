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

  test('zoom steps change the label and grow the visual frame without resizing CSS pixels', async ({
    page,
  }) => {
    await setup(page);
    const controls = previewControls(page);
    const zoomLabel = controls.getByText(/^\d+%$/).first();

    // First zoom-in leaves fit mode and enters manual zoom at 110%.
    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('110%');

    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('120%');
    const box120 = await previewFrames(page).nth(0).boundingBox();

    await controls.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLabel).toHaveText('130%');
    const box130 = await previewFrames(page).nth(0).boundingBox();

    expect(box120).not.toBeNull();
    expect(box130).not.toBeNull();
    expect(box130!.width).toBeGreaterThan(box120!.width);

    await controls.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoomLabel).toHaveText('120%');

    // Zoom is purely visual: the document's CSS viewport never changes.
    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(375);
    expect(metrics.innerHeight).toBe(667);
  });
});
