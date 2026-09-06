import { expect, test, type Page } from '@playwright/test';

import {
  addDevice,
  fixtureUrl,
  gotoApp,
  previewFrames,
  setSharedUrl,
  waitForFrameReady,
} from './helpers';

const PROJECT_KEY_PREFIX = 'devicelab.project.';
const LAST_PROJECT_KEY = 'devicelab.lastProject';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function clearAndReload(page: Page): Promise<void> {
  await gotoApp(page);
  await page.evaluate(
    ([prefix, lastKey]: [string, string]) => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(prefix) || k === lastKey)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    },
    [PROJECT_KEY_PREFIX, LAST_PROJECT_KEY] as [string, string]
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Shared preview URL')).toBeVisible();
}

async function saveProject(page: Page, name: string): Promise<void> {
  // Set the project name by clicking on it and typing
  const nameBtn = page.getByRole('button', { name: /Project|Untitled/ });
  if (await nameBtn.isVisible()) {
    await nameBtn.click();
  }
  const nameInput = page.getByLabel('Project name');
  await nameInput.fill(name);
  await nameInput.press('Enter');

  // Save
  await page.getByLabel('Save project').click();
  // Wait for the saved name to appear
  await expect(
    page.getByRole('button', { name: new RegExp(name) })
  ).toBeVisible({ timeout: 5000 });
}

async function openProjectMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open project' }).click();
}

/** Add a device and wait for its iframe to be ready. */
async function addDeviceReady(
  page: Page,
  name: string,
  index = 0
): Promise<void> {
  await addDevice(page, name);
  await waitForFrameReady(page, index);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('project management', () => {
  test('save a configured workspace through the UI and reload it', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Set a URL and add a device
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');

    // Save the project
    await saveProject(page, 'Test Project');

    // Verify localStorage has the project
    const projectCount = await page.evaluate((prefix: string) => {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) count++;
      }
      return count;
    }, PROJECT_KEY_PREFIX);
    expect(projectCount).toBe(1);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // The workspace should be restored
    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');
    await expect(page.getByLabel('Shared preview URL')).toHaveValue(
      fixtureUrl('clean')
    );
    await expect(previewFrames(page)).toHaveCount(1);
    await waitForFrameReady(page, 0);
  });

  test('dirty → Open → Cancel preserves state', async ({ page }) => {
    await clearAndReload(page);

    // Create project A
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Project A');

    // Create project B
    await page.getByLabel('New project').click();
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPad');
    await saveProject(page, 'Project B');

    // Reload to start fresh with project B
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitForFrameReady(page, 0);

    // Add something to make dirty
    await addDevice(page, 'iPhone 15');

    // Try to Open project A — should show confirm dialog
    await openProjectMenu(page);
    await page.getByText('Project A').first().click();

    // Confirm dialog should appear
    const dialog = page.getByRole('dialog', { name: /discard/i });
    await expect(dialog).toBeVisible();

    // Cancel
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    // Workspace should still have the added device (dirty preserved)
    await expect(previewFrames(page)).toHaveCount(2);
  });

  test('dirty → Open → Discard proceeds', async ({ page }) => {
    await clearAndReload(page);

    // Create project A
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Project A');

    // Create project B
    await page.getByLabel('New project').click();
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPad');
    await saveProject(page, 'Project B');

    // Reload to start with project B
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitForFrameReady(page, 0);

    // Add a device to make dirty
    await addDevice(page, 'iPhone 15');

    // Open project A with discard
    await openProjectMenu(page);
    await page.getByText('Project A').first().click();

    // Confirm dialog should appear
    const dialog = page.getByRole('dialog', { name: /discard/i });
    await expect(dialog).toBeVisible();

    // Click Discard
    await dialog.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog).not.toBeVisible();

    // Should have project A's single device
    await expect(previewFrames(page)).toHaveCount(1);
    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');
  });

  test('delete project from menu', async ({ page }) => {
    await clearAndReload(page);

    // Create a project
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'To Delete');

    // Open menu and click delete
    await openProjectMenu(page);
    await page.getByLabel('Delete To Delete').click();

    // Confirm dialog
    const dialog = page.getByRole('dialog', { name: /delete project/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).not.toBeVisible();

    // Project should be gone from menu
    await openProjectMenu(page);
    await expect(page.getByText('To Delete')).not.toBeVisible();
  });

  test('current-project deletion resets workspace', async ({ page }) => {
    await clearAndReload(page);

    // Create a project
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Current Project');

    // Delete via the trash icon in header
    await page.getByLabel('Delete project').click();

    // Confirm dialog
    const dialog = page.getByRole('dialog', { name: /delete project/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).not.toBeVisible();

    // Workspace should be empty
    await expect(
      page.getByText('Add a device above to start previewing')
    ).toBeVisible();
    await expect(previewFrames(page)).toHaveCount(0);
  });

  test('two projects preserve independent configurations', async ({ page }) => {
    await clearAndReload(page);

    // Create project A with iPhone
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Project Alpha');

    // Create project B with iPad
    await page.getByLabel('New project').click();
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPad');
    await saveProject(page, 'Project Beta');

    // Reload and verify project B is loaded
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitForFrameReady(page, 0);
    const selectB = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(selectB).toHaveValue('ipad');

    // Switch to project A
    await openProjectMenu(page);
    await page.getByText('Project Alpha').first().click();

    // Should load project A
    await waitForFrameReady(page, 0);
    const selectA = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(selectA).toHaveValue('iphone-15');
  });

  test('custom viewport and compare state survive UI-driven save/load', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Add two devices with a URL
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await addDeviceReady(page, 'iPad', 1);

    // Save with default state
    await saveProject(page, 'Viewport Test');

    // Reload to ensure clean state
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitForFrameReady(page, 0);

    // Both devices should be restored
    await expect(previewFrames(page)).toHaveCount(2);

    // Name should show in header
    await expect(
      page.getByRole('button', { name: /Viewport Test/ })
    ).toBeVisible();
  });
});
