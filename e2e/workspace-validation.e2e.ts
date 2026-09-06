import { expect, test, type Page } from '@playwright/test';

import {
  addDevice,
  clickOrientation,
  customViewportCommit,
  fixtureUrl,
  frameContainer,
  gotoApp,
  inspectionsPanel,
  previewCard,
  previewControls,
  previewFrames,
  readFrameMetrics,
  selectCustomViewport,
  selectPresetDeviceById,
  setSharedUrl,
  startInspection,
  waitForFrameReady,
  zoomLabelValue,
  zoomToManual,
} from './helpers';

/**
 * Browser validation of the multi-preview workspace + per-instance viewport
 * behavior (Task 2E-4).
 *
 * Validates in real Chromium, using actual DOM geometry / iframe state:
 * - Grid / Focus / Compare layout transitions
 * - Per-instance device / orientation / custom-viewport state independence
 * - Orientation geometry + landscape-only presets
 * - Custom viewport editing (atomic commits, invalid-value preservation)
 * - Manual zoom, Fit, persistence, and 25%/300% clamps
 * - Rulers, grid, safe-area, and viewport-info tools
 * - Remove / re-add / reload lifecycle
 * - Ghost-iframe / controller duplication invariants
 * - Inspection remains callable after layout transitions
 *
 * Ground rules honored here:
 * - Auto-fit zoom percent is container-dependent; it is never asserted as an
 *   absolute number.
 * - Preview instances are ALWAYS mounted (one PreviewInstance per entry); a
 *   layout transition only changes which cards are CSS-visible, so controllers,
 *   iframes, zoom, and inspection snapshots persist across Grid/Focus/Compare
 *   switches — never reset to fit / idle.
 * - The app surfaces the DEVICE's DPR (a preset value), never the outer
 *   browser's devicePixelRatio.
 */

async function setup(
  page: Page,
  devices: string[],
  fixture = 'clean'
): Promise<void> {
  await gotoApp(page);
  await setSharedUrl(page, fixtureUrl(fixture));
  for (const device of devices) {
    await addDevice(page, device);
  }
  for (let i = 0; i < devices.length; i++) {
    await waitForFrameReady(page, i);
  }
}

test.describe('layout transitions + workspace invariants', () => {
  test('grid: changing one instance device leaves siblings untouched', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);

    await selectPresetDeviceById(page, 0, 'ipad');
    await waitForFrameReady(page, 0);

    const edited = await readFrameMetrics(page, 0);
    expect(edited.innerWidth).toBe(820);
    expect(edited.innerHeight).toBe(1180);
    const sibling = await readFrameMetrics(page, 1);
    expect(sibling.innerWidth).toBe(393);
    expect(sibling.innerHeight).toBe(852);

    expect(previewControls(page, 0).getByText('820 × 1180 · 2×')).toBeVisible();
    expect(previewControls(page, 1).getByText('393 × 852 · 3×')).toBeVisible();
  });

  test('grid: manual zoom is per-instance', async ({ page }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);
    const before = await zoomLabelValue(page, 1);

    await zoomToManual(page, 110, 0);

    await expect(previewControls(page, 0).getByText('110%')).toBeVisible();
    expect(await zoomLabelValue(page, 1)).toBe(before);
  });

  test('focus: only the active card is visible; thumbnails switch it (instances persist)', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15', 'iPad']);
    await expect(previewFrames(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    await waitForFrameReady(page, 0);

    // Instances stay mounted; focus only toggles which card is visible.
    await expect(previewCard(page, 0)).toBeVisible();
    await expect(previewCard(page, 1)).not.toBeVisible();
    await expect(previewCard(page, 2)).not.toBeVisible();

    await expect(
      page.getByRole('button', { name: /^iPhone SE preview \(active\)$/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^iPhone 15 preview$/ })
    ).toBeVisible();

    await page.getByRole('button', { name: /^iPad preview$/ }).click();
    await waitForFrameReady(page, 0);
    await expect(previewCard(page, 2)).toBeVisible();
    await expect(previewCard(page, 0)).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: /^iPad preview \(active\)$/ })
    ).toBeVisible();
  });

  test('grid → focus → grid preserves config, zoom, and orientation (no ghost frames)', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15', 'iPad']);

    await clickOrientation(page, 'landscape', 1);
    await waitForFrameReady(page, 1);

    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    await waitForFrameReady(page, 0);

    await page.getByRole('button', { name: 'Grid layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await waitForFrameReady(page, i);
    }

    expect(previewControls(page, 0).getByLabel('Select device')).toHaveValue(
      'iphone-se'
    );
    expect(previewControls(page, 1).getByLabel('Select device')).toHaveValue(
      'iphone-15'
    );
    expect(previewControls(page, 2).getByLabel('Select device')).toHaveValue(
      'ipad'
    );

    await expect(
      previewControls(page, 1).getByRole('button', {
        name: 'Landscape orientation',
        exact: true,
      })
    ).toHaveAttribute('aria-pressed', 'true');

    // Instances persist across layout switches => fit/zoom state is preserved
    // (never reset to fit by a fresh controller).
    for (let i = 0; i < 3; i++) {
      await expect(
        previewControls(page, i).getByRole('button', {
          name: 'Fit preview to container',
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'true');
    }

    const landscape = await readFrameMetrics(page, 1);
    expect(landscape.innerWidth).toBe(852);
    expect(landscape.innerHeight).toBe(393);
  });

  test('focus: removing the active entry promotes the next one', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);

    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(2);
    await expect(previewCard(page, 0)).toBeVisible();
    await waitForFrameReady(page, 0);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Remove preview' })
      .click();

    await expect(previewFrames(page)).toHaveCount(1);
    await waitForFrameReady(page, 0);
    await expect(
      page.getByRole('button', { name: /^iPhone 15 preview \(active\)$/ })
    ).toBeVisible();
  });

  test('compare: selections toggle visibility; dropping below 2 exits to grid', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15', 'iPad']);

    await page.getByRole('button', { name: 'Compare layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    await expect(previewCard(page, 0)).toBeVisible();
    await expect(previewCard(page, 1)).toBeVisible();
    await expect(previewCard(page, 2)).not.toBeVisible();
    await waitForFrameReady(page, 1);

    await page.getByRole('checkbox', { name: /^Compare iPad$/ }).click();
    await expect(previewCard(page, 2)).toBeVisible();
    await waitForFrameReady(page, 2);

    await page
      .getByRole('checkbox', { name: /^Compare iPhone SE \(selected\)$/ })
      .click();
    await expect(previewCard(page, 0)).not.toBeVisible();
    await expect(previewCard(page, 1)).toBeVisible();
    await waitForFrameReady(page, 1);

    await page
      .getByRole('checkbox', { name: /^Compare iPhone 15 \(selected\)$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Grid layout' })
    ).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 3; i++) {
      await expect(previewCard(page, i)).toBeVisible();
      await waitForFrameReady(page, i);
    }
  });

  test('inspection stays callable across layout transitions (results persist)', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);
    await startInspection(page);
    await expect(
      inspectionsPanel(page).getByText('2 devices scanned')
    ).toBeVisible();

    // Instances persist across layout switches => inspection results survive
    // the transition instead of being reset to the idle prompt. In focus mode
    // the panel scopes to the active device.
    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(2);
    await waitForFrameReady(page, 0);
    await expect(inspectionsPanel(page)).toBeVisible();
    await expect(
      inspectionsPanel(page).getByText('1 device scanned')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Grid layout' }).click();
    await expect(previewFrames(page)).toHaveCount(2);
    await waitForFrameReady(page, 1);

    await inspectionsPanel(page)
      .getByRole('button', { name: 'Rescan' })
      .click();
    await expect(
      inspectionsPanel(page).getByText('2 devices scanned')
    ).toBeVisible();
    await expect(
      inspectionsPanel(page).getByText('No issues found')
    ).toBeVisible();
  });
});

test.describe('orientation geometry', () => {
  test('orientation toggle is per-instance and reloads only that frame', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);

    await clickOrientation(page, 'landscape', 0);
    await waitForFrameReady(page, 0);

    const flipped = await readFrameMetrics(page, 0);
    expect(flipped.innerWidth).toBe(667);
    expect(flipped.innerHeight).toBe(375);

    const sibling = await readFrameMetrics(page, 1);
    expect(sibling.innerWidth).toBe(393);
    expect(sibling.innerHeight).toBe(852);

    expect(previewControls(page, 0).getByText('667 × 375 · 2×')).toBeVisible();
    expect(previewControls(page, 1).getByText('393 × 852 · 3×')).toBeVisible();
  });

  test('safe-area bars transpose with orientation (geometry-based)', async ({
    page,
  }) => {
    await setup(page, ['iPhone 15']);
    const card = previewCard(page, 0);

    const readBar = async () => {
      const bar = await card
        .getByText('59px', { exact: true })
        .first()
        .locator('..')
        .boundingBox();
      const frame = await frameContainer(card).boundingBox();
      expect(bar).not.toBeNull();
      expect(frame).not.toBeNull();
      return { w: bar!.width / frame!.width, h: bar!.height / frame!.height };
    };

    // Portrait: the 59px inset is a TOP bar spanning the full width.
    const portrait = await readBar();
    expect(portrait.w).toBeGreaterThan(0.95);
    expect(portrait.h).toBeLessThan(0.25);

    await clickOrientation(page, 'landscape', 0);
    await waitForFrameReady(page, 0);

    // Landscape: the same inset transposes to a RIGHT bar spanning full height.
    const landscape = await readBar();
    expect(landscape.w).toBeLessThan(0.25);
    expect(landscape.h).toBeGreaterThan(0.95);
  });

  test('zero safe-area devices render no overlay bars', async ({ page }) => {
    await setup(page, ['iPhone SE']);
    const card = previewCard(page, 0);
    expect(card.getByText('59px', { exact: true })).toHaveCount(0);
    expect(card.getByText('34px', { exact: true })).toHaveCount(0);
  });

  test('desktop presets are landscape-only (portrait disabled)', async ({
    page,
  }) => {
    await setup(page, ['Desktop 1280']);

    await expect(
      previewControls(page, 0).getByRole('button', {
        name: 'Portrait orientation',
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      previewControls(page, 0).getByRole('button', {
        name: 'Landscape orientation',
        exact: true,
      })
    ).toBeEnabled();

    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(1280);
    expect(metrics.innerHeight).toBe(720);
  });

  test('manual zoom survives an in-place orientation flip', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE']);
    await zoomToManual(page, 110, 0);

    await clickOrientation(page, 'landscape', 0);
    await waitForFrameReady(page, 0);

    expect(await zoomLabelValue(page, 0)).toBe(110);
    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(667);
    expect(metrics.innerHeight).toBe(375);
  });
});

test.describe('custom viewport', () => {
  test('preset → custom switches to a synthetic 375×667 device', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE']);

    await selectCustomViewport(page, 0);
    await waitForFrameReady(page, 0);

    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(375);
    expect(metrics.innerHeight).toBe(667);

    expect(
      previewControls(page, 0).getByLabel('Custom viewport width')
    ).toHaveValue('375');
    expect(
      previewControls(page, 0).getByLabel('Custom viewport height')
    ).toHaveValue('667');
    expect(previewControls(page, 0).getByLabel('Select device')).toHaveValue(
      '__custom__'
    );
    expect(previewControls(page, 0).getByText('375 × 667 · 1×')).toBeVisible();

    await expect(
      previewControls(page, 0).getByRole('button', {
        name: 'Portrait orientation',
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      previewControls(page, 0).getByRole('button', {
        name: 'Landscape orientation',
        exact: true,
      })
    ).toBeDisabled();
  });

  test('committing 1024×768 drives the frame and info overlay', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE']);
    await selectCustomViewport(page, 0);

    await customViewportCommit(page, 0, '1024', '768');
    await waitForFrameReady(page, 0);

    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(1024);
    expect(metrics.innerHeight).toBe(768);
    expect(previewControls(page, 0).getByText('1024 × 768 · 1×')).toBeVisible();

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle viewport info' })
      .click();
    const overlay = previewCard(page, 0).getByTestId('viewport-info-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Custom');
    await expect(overlay).toContainText('1024×768 CSS');
    await expect(overlay).toContainText('1024×768 PX');
    await expect(overlay).toContainText('DPR 1×');
  });

  test('invalid custom dimensions preserve the last valid ones', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE']);
    await selectCustomViewport(page, 0);

    await customViewportCommit(page, 0, '320', '640');
    await waitForFrameReady(page, 0);
    let metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(320);
    expect(metrics.innerHeight).toBe(640);

    for (const bad of ['1024.5', '99', '4001', 'abc', '0', '-5']) {
      await customViewportCommit(page, 0, bad, '640');
      metrics = await readFrameMetrics(page, 0);
      expect(metrics.innerWidth).toBe(320);
      expect(metrics.innerHeight).toBe(640);
    }

    expect(previewControls(page, 0).getByLabel('Select device')).toHaveValue(
      '__custom__'
    );
  });

  test('custom viewport survives grid → focus → grid', async ({ page }) => {
    await setup(page, ['iPhone SE']);
    await selectCustomViewport(page, 0);
    await customViewportCommit(page, 0, '1024', '768');
    await waitForFrameReady(page, 0);

    await addDevice(page, 'iPad');
    await waitForFrameReady(page, 1);

    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(2);
    await waitForFrameReady(page, 0);
    await expect(
      page.getByRole('button', {
        name: /^Custom 1024 × 768 preview \(active\)$/,
      })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Grid layout' }).click();
    await expect(previewFrames(page)).toHaveCount(2);
    await waitForFrameReady(page, 0);

    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(1024);
    expect(metrics.innerHeight).toBe(768);
    expect(
      previewControls(page, 0).getByLabel('Custom viewport width')
    ).toHaveValue('1024');
    expect(
      previewControls(page, 0).getByLabel('Custom viewport height')
    ).toHaveValue('768');
  });
});

test.describe('zoom + fit', () => {
  test('manual zoom persists across in-place device change; Fit restores', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);
    await zoomToManual(page, 110, 0);
    const siblingBefore = await zoomLabelValue(page, 1);

    await selectPresetDeviceById(page, 0, 'ipad');
    await waitForFrameReady(page, 0);
    expect(await zoomLabelValue(page, 0)).toBe(110);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Fit preview to container', exact: true })
      .click();
    await expect(
      previewControls(page, 0).getByRole('button', {
        name: 'Fit preview to container',
        exact: true,
      })
    ).toHaveAttribute('aria-pressed', 'true');

    const afterFit = await zoomLabelValue(page, 0);
    expect(afterFit).not.toBe(110);
    expect(await zoomLabelValue(page, 1)).toBe(siblingBefore);
  });

  test('zoom clamps at 300% and 25% with buttons disabled', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE']);
    const controls = previewControls(page, 0);
    const inBtn = controls.getByRole('button', {
      name: 'Zoom in',
      exact: true,
    });
    const outBtn = controls.getByRole('button', {
      name: 'Zoom out',
      exact: true,
    });

    let guard = 0;
    while ((await inBtn.isEnabled()) && guard < 200) {
      await inBtn.click();
      guard += 1;
    }
    await expect(inBtn).toBeDisabled();
    expect(await zoomLabelValue(page, 0)).toBe(300);

    guard = 0;
    while ((await outBtn.isEnabled()) && guard < 200) {
      await outBtn.click();
      guard += 1;
    }
    await expect(outBtn).toBeDisabled();
    expect(await zoomLabelValue(page, 0)).toBe(25);
  });
});

test.describe('viewport tools', () => {
  test('rulers scale with zoom linearly and are per-instance', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);
    await zoomToManual(page, 110, 0);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle rulers' })
      .click();

    const card0 = previewCard(page, 0);
    const card1 = previewCard(page, 1);

    const topStyle = await card0
      .locator('canvas[data-testid="ruler-top"]')
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
      });
    expect(topStyle.width).toBeCloseTo(375 * 1.1, 1);
    expect(topStyle.height).toBeCloseTo(22, 1);

    const leftStyle = await card0
      .locator('canvas[data-testid="ruler-left"]')
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
      });
    expect(leftStyle.width).toBeCloseTo(22, 1);
    expect(leftStyle.height).toBeCloseTo(667 * 1.1, 1);

    expect(card1.locator('canvas[data-testid="ruler-top"]')).toHaveCount(0);
    expect(card1.locator('canvas[data-testid="ruler-left"]')).toHaveCount(0);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle rulers' })
      .click();
    expect(card0.locator('canvas[data-testid="ruler-top"]')).toHaveCount(0);
  });

  test('grid overlay is host-side and viewport-sized', async ({ page }) => {
    await setup(page, ['iPhone SE']);
    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle grid overlay' })
      .click();

    const grid = previewCard(page, 0).getByTestId('grid-overlay');
    await expect(grid).toBeVisible();
    const size = await grid.evaluate(
      (el) => getComputedStyle(el).backgroundSize
    );
    expect(size).toContain('100px 100px');
    expect(size).toContain('20px 20px');

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle grid overlay' })
      .click();
    expect(previewCard(page, 0).getByTestId('grid-overlay')).toHaveCount(0);
  });

  test('safe-area overlay defaults on and can be toggled', async ({ page }) => {
    await setup(page, ['iPhone 15']);
    const card = previewCard(page, 0);
    await expect(card.getByText('59px', { exact: true })).toBeVisible();
    await expect(card.getByText('34px', { exact: true })).toBeVisible();

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle safe-area' })
      .click();
    expect(card.getByText('59px', { exact: true })).toHaveCount(0);
    expect(card.getByText('34px', { exact: true })).toHaveCount(0);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle safe-area' })
      .click();
    await expect(card.getByText('59px', { exact: true })).toBeVisible();
  });

  test('viewport info readout reports CSS + physical pixels and zoom', async ({
    page,
  }) => {
    await setup(page, ['iPhone 15']);
    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle viewport info' })
      .click();

    const overlay = previewCard(page, 0).getByTestId('viewport-info-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Preset');
    await expect(overlay).toContainText('393×852 CSS');
    await expect(overlay).toContainText('1179×2556 PX');
    await expect(overlay).toContainText('DPR 3×');

    await zoomToManual(page, 110, 0);
    await expect(overlay).toContainText('@ 110%');

    await previewControls(page, 0)
      .getByRole('button', { name: 'Toggle viewport info' })
      .click();
    expect(
      previewCard(page, 0).getByTestId('viewport-info-overlay')
    ).toHaveCount(0);
  });
});

test.describe('lifecycle robustness', () => {
  test('removing one instance in grid preserves the sibling', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15']);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Remove preview' })
      .click();

    await expect(previewFrames(page)).toHaveCount(1);
    await expect(previewControls(page)).toHaveCount(1);
    await waitForFrameReady(page, 0);

    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(393);
    expect(metrics.innerHeight).toBe(852);
    expect(previewControls(page, 0).getByText('393 × 852 · 3×')).toBeVisible();
  });

  test('empty → re-add recovery', async ({ page }) => {
    await setup(page, ['iPhone SE']);

    await previewControls(page, 0)
      .getByRole('button', { name: 'Remove preview' })
      .click();
    await expect(previewFrames(page)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add a device', exact: true })
    ).toBeVisible();

    await addDevice(page, 'iPhone 15');
    await waitForFrameReady(page, 0);
    await expect(previewFrames(page)).toHaveCount(1);
    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(393);
    expect(metrics.innerHeight).toBe(852);
  });

  test('reload keeps the same URL and viewport', async ({ page }) => {
    await setup(page, ['iPhone SE']);
    const srcBefore = await previewFrames(page).nth(0).getAttribute('src');

    await previewControls(page, 0)
      .getByRole('button', { name: 'Reload preview' })
      .click();
    await waitForFrameReady(page, 0);

    const srcAfter = await previewFrames(page).nth(0).getAttribute('src');
    expect(srcAfter).toBe(srcBefore);
    const metrics = await readFrameMetrics(page, 0);
    expect(metrics.innerWidth).toBe(375);
    expect(metrics.innerHeight).toBe(667);
  });

  test('iframe count stays exact across grid → focus → compare → grid', async ({
    page,
  }) => {
    await setup(page, ['iPhone SE', 'iPhone 15', 'iPad']);
    await expect(previewFrames(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Focus layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    await waitForFrameReady(page, 0);

    await page.getByRole('button', { name: 'Compare layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    await waitForFrameReady(page, 1);

    await page.getByRole('button', { name: 'Grid layout' }).click();
    await expect(previewFrames(page)).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await waitForFrameReady(page, i);
    }
  });
});
