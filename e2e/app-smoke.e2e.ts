import { expect, test } from '@playwright/test';

import {
  addDevice,
  fixtureUrl,
  gotoApp,
  previewFrames,
  setSharedUrl,
  waitForFrameReady,
} from './helpers';

test.describe('app smoke', () => {
  test('boots and renders a preview from a shared fixture URL', async ({
    page,
  }) => {
    await gotoApp(page);
    await expect(
      page.getByRole('button', { name: 'Add a device', exact: true })
    ).toBeVisible();

    await setSharedUrl(page, fixtureUrl('clean'));
    await addDevice(page, 'iPhone SE');
    await waitForFrameReady(page);

    await expect(
      page.locator('nav[aria-label="Workspace controls"]')
    ).toBeVisible();
    await expect(
      page.locator('nav[aria-label="Preview controls"]')
    ).toBeVisible();
    await expect(previewFrames(page)).toHaveCount(1);
    await expect(
      page.locator('nav[aria-label="Preview controls"]')
    ).toContainText('iPhone SE');

    const docTitle = await page.evaluate(() => {
      const f = document.querySelector(
        'iframe[title="Device preview"]'
      ) as HTMLIFrameElement | null;
      return f?.contentDocument?.title ?? null;
    });
    expect(docTitle).toBe('Clean fixture');
  });

  test('adds and removes multiple previews', async ({ page }) => {
    await gotoApp(page);
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDevice(page, 'iPhone SE');
    await addDevice(page, 'iPhone 15');
    await waitForFrameReady(page, 0);
    await waitForFrameReady(page, 1);

    await expect(previewFrames(page)).toHaveCount(2);
    await expect(
      page.locator('nav[aria-label="Preview controls"]')
    ).toHaveCount(2);

    await page
      .locator('nav[aria-label="Preview controls"]')
      .nth(1)
      .getByRole('button', { name: 'Remove preview' })
      .click();

    await expect(previewFrames(page)).toHaveCount(1);
    await expect(
      page.locator('nav[aria-label="Preview controls"]')
    ).toHaveCount(1);
  });
});
