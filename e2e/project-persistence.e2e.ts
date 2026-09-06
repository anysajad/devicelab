import { expect, test } from '@playwright/test';

import {
  fixtureUrl,
  gotoApp,
  previewFrames,
  waitForFrameReady,
} from './helpers';

const PROJECT_KEY_PREFIX = 'devicelab.project.';
const LAST_PROJECT_KEY = 'devicelab.lastProject';

/**
 * Build a valid ProjectRecord JSON string for seeding localStorage.
 */
function buildSeedRecord(
  id: string,
  opts?: {
    name?: string;
    sharedUrl?: string;
    deviceId?: string;
    orientation?: string;
    layoutMode?: string;
    compareIds?: string[];
    activeId?: string | null;
    viewportMode?: string;
    customViewportWidth?: number;
    customViewportHeight?: number;
  }
): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    meta: {
      name: opts?.name ?? 'Seeded Project',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    },
    data: {
      sharedUrl: opts?.sharedUrl ?? fixtureUrl('clean'),
      entries: [
        {
          id: 'preview-1',
          deviceId: opts?.deviceId ?? 'iphone-15',
          orientation: opts?.orientation ?? 'portrait',
          ...(opts?.viewportMode ? { viewportMode: opts.viewportMode } : {}),
          ...(opts?.customViewportWidth
            ? { customViewportWidth: opts.customViewportWidth }
            : {}),
          ...(opts?.customViewportHeight
            ? { customViewportHeight: opts.customViewportHeight }
            : {}),
        },
      ],
      layoutMode: opts?.layoutMode ?? 'grid',
      compareIds: opts?.compareIds ?? [],
      activeId: opts?.activeId ?? 'preview-1',
    },
  });
}

test.describe('project persistence smoke', () => {
  test('seeded project restores workspace on boot', async ({
    page,
    context,
  }) => {
    const projectId = 'smoke-restore-test';
    const seedData = buildSeedRecord(projectId, {
      name: 'Smoke Test Project',
      sharedUrl: fixtureUrl('clean'),
      deviceId: 'iphone-15',
    });

    // Seed localStorage before the app boots
    await context.addInitScript(
      (args: [string, string, string]) => {
        const [projectKey, lastProjectKey, recordJson] = args;
        localStorage.setItem(projectKey, recordJson);
        localStorage.setItem(
          lastProjectKey,
          JSON.stringify('smoke-restore-test')
        );
      },
      [`${PROJECT_KEY_PREFIX}${projectId}`, LAST_PROJECT_KEY, seedData] as [
        string,
        string,
        string,
      ]
    );

    await gotoApp(page);

    // The workspace should show the seeded device
    const select = page
      .locator('nav[aria-label="Preview controls"]')
      .first()
      .getByLabel('Select device');
    await expect(select).toHaveValue('iphone-15');

    // The shared URL input should show the seeded URL
    const urlInput = page.getByLabel('Shared preview URL');
    await expect(urlInput).toHaveValue(fixtureUrl('clean'));

    // An iframe should be present and reach ready state
    await expect(previewFrames(page)).toHaveCount(1);
    await waitForFrameReady(page, 0);
  });

  test('empty storage boots with empty workspace', async ({ page }) => {
    // Fresh context with no seeded storage
    await gotoApp(page);

    // Should show empty state
    await expect(
      page.getByText('Add a device above to start previewing')
    ).toBeVisible();

    // No iframes
    await expect(previewFrames(page)).toHaveCount(0);

    // URL input should be empty
    const urlInput = page.getByLabel('Shared preview URL');
    await expect(urlInput).toHaveValue('');
  });
});
