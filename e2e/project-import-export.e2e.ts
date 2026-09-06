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
  const nameBtn = page.getByRole('button', { name: /Project|Untitled/ });
  if (await nameBtn.isVisible()) {
    await nameBtn.click();
  }
  const nameInput = page.getByLabel('Project name');
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await page.getByLabel('Save project').click();
  await expect(
    page.getByRole('button', { name: new RegExp(name) })
  ).toBeVisible({ timeout: 5000 });
}

async function addDeviceReady(
  page: Page,
  name: string,
  index = 0
): Promise<void> {
  await addDevice(page, name);
  await waitForFrameReady(page, index);
}

/** Read the text of a downloaded file. */
async function downloadToFile(
  page: Page,
  trigger: () => Promise<void>
): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    trigger(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('download path unavailable');
  const fs = await import('node:fs/promises');
  return fs.readFile(path, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('project import/export', () => {
  test('save → export → import → complete workspace restoration', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Configure workspace
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');

    // Save
    await saveProject(page, 'Export Test');

    // Export — trigger download
    const json = await downloadToFile(page, () =>
      page.getByLabel('Export project').click()
    );

    // Validate exported JSON
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.meta.name).toBe('Export Test');
    expect(parsed.data.sharedUrl).toBe(fixtureUrl('clean'));
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.entries[0].deviceId).toBe('iphone-15');

    // No runtime-only state in export
    expect(parsed.lifecycleStatus).toBeUndefined();
    expect(parsed.inspectionResults).toBeUndefined();

    // Now import on a clean page
    await clearAndReload(page);

    // Set up the file input for import
    const fileInput = page.getByLabel('Import project file');
    await fileInput.setInputFiles({
      name: 'export-test.devicelab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json, 'utf-8'),
    });

    // Import should succeed — workspace restored
    await expect(page.getByText('Imported "Export Test"')).toBeVisible({
      timeout: 10000,
    });
    await expect(previewFrames(page)).toHaveCount(1);
    await waitForFrameReady(page, 0);
    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');
    await expect(page.getByLabel('Shared preview URL')).toHaveValue(
      fixtureUrl('clean')
    );
  });

  test('import with unsaved changes → Cancel preserves workspace', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Create a project and add a device
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Existing Project');

    // Add another device to make dirty
    await addDevice(page, 'iPad');
    await waitForFrameReady(page, 1);
    await expect(previewFrames(page)).toHaveCount(2);

    // Prepare import file
    const importRecord = {
      schemaVersion: 1,
      id: 'imported-id',
      meta: {
        name: 'Imported Project',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      data: {
        sharedUrl: fixtureUrl('clean'),
        entries: [
          { id: 'imp-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      },
    };

    const fileInput = page.getByLabel('Import project file');
    await fileInput.setInputFiles({
      name: 'imported.devicelab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importRecord), 'utf-8'),
    });

    // Confirm dialog should appear
    const dialog = page.getByRole('dialog', { name: /replace workspace/i });
    await expect(dialog).toBeVisible();

    // Cancel
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    // Workspace unchanged — both devices still present
    await expect(previewFrames(page)).toHaveCount(2);
  });

  test('import with unsaved changes → Confirm replaces workspace', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Create a project
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');
    await saveProject(page, 'Original');

    // Make dirty
    await addDevice(page, 'iPad');
    await waitForFrameReady(page, 1);
    await expect(previewFrames(page)).toHaveCount(2);

    // Import
    const importRecord = {
      schemaVersion: 1,
      id: 'imported-id',
      meta: {
        name: 'Imported',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      data: {
        sharedUrl: fixtureUrl('clean'),
        entries: [
          { id: 'imp-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      },
    };

    const fileInput = page.getByLabel('Import project file');
    await fileInput.setInputFiles({
      name: 'imported.devicelab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importRecord), 'utf-8'),
    });

    // Confirm dialog
    const dialog = page.getByRole('dialog', { name: /replace workspace/i });
    await expect(dialog).toBeVisible();

    // Click Import (confirm)
    await dialog.getByRole('button', { name: 'Import' }).click();
    await expect(dialog).not.toBeVisible();

    // Workspace replaced — single device
    await expect(previewFrames(page)).toHaveCount(1);

    // Info notice should show success
    await expect(page.getByRole('alert')).toContainText('Imported');
  });

  test('invalid JSON → error shown and workspace untouched', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Set up workspace
    await setSharedUrl(page, fixtureUrl('clean'));
    await addDeviceReady(page, 'iPhone 15');

    // Try importing invalid JSON
    const fileInput = page.getByLabel('Import project file');
    await fileInput.setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not valid json at all', 'utf-8'),
    });

    // Error notice shown
    await expect(page.getByText('Import failed')).toBeVisible();

    // Workspace untouched
    await expect(previewFrames(page)).toHaveCount(1);
    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');
  });

  test('imported project gets new ID and persists across reload', async ({
    page,
  }) => {
    await clearAndReload(page);

    // Import a project
    const importRecord = {
      schemaVersion: 1,
      id: 'file-id-should-not-match',
      meta: {
        name: 'Fresh Import',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      data: {
        sharedUrl: fixtureUrl('clean'),
        entries: [
          { id: 'imp-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      },
    };

    const fileInput = page.getByLabel('Import project file');
    await fileInput.setInputFiles({
      name: 'fresh-import.devicelab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importRecord), 'utf-8'),
    });

    // Success
    await expect(page.getByText('Imported "Fresh Import"')).toBeVisible({
      timeout: 10000,
    });

    // Verify the imported ID is not the file's ID
    const importedId = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('devicelab.project.')) keys.push(k);
      }
      return keys[0]?.replace('devicelab.project.', '') ?? null;
    });
    expect(importedId).not.toBe('file-id-should-not-match');
    expect(importedId).toBeTruthy();

    // Reload — workspace should be restored (import persisted immediately)
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await waitForFrameReady(page, 0);

    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');
    await expect(
      page.getByRole('button', { name: /Fresh Import/ })
    ).toBeVisible();
  });
});
