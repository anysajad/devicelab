import { expect, test, type Page } from '@playwright/test';

import {
  CROSS_ORIGIN_URL,
  addDevice,
  diagnosticItems,
  fixtureUrl,
  gotoApp,
  inspectionsPanel,
  previewControls,
  readFrameMetrics,
  setSharedUrl,
  startInspection,
  summaryBadge,
  waitForFrameReady,
} from './helpers';

async function inspectFixture(
  page: Page,
  fixture: string,
  device = 'iPhone SE'
): Promise<void> {
  await gotoApp(page);
  await setSharedUrl(page, fixtureUrl(fixture));
  await addDevice(page, device);
  await waitForFrameReady(page);
  await startInspection(page);
}

test.describe('responsive diagnostics in a real browser', () => {
  test('clean page reports no issues', async ({ page }) => {
    await inspectFixture(page, 'clean');
    await expect(
      inspectionsPanel(page).getByText('No issues found')
    ).toBeVisible();
    await expect(diagnosticItems(page, 'iPhone SE')).toHaveCount(0);
  });

  test('a 1200px wide element overflows a 375px viewport (error)', async ({
    page,
  }) => {
    await inspectFixture(page, 'overflow');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);
    await expect(summaryBadge(page, '1 error')).toBeVisible();
    await expect(items.first()).toContainText('Horizontal overflow');
    await expect(items.first()).toContainText(
      'Page content overflows horizontally by 825px (1200px wide in a 375px viewport).'
    );
    await expect(items.first().getByLabel('Severity: Error')).toBeVisible();
    await expect(items.nth(1)).toContainText('Off-viewport');
    await expect(items.nth(1)).toContainText(
      'Element extends outside the viewport (rect: 0–1200, 0–40).'
    );
  });

  test('RTL left overflow is detected on the left side', async ({ page }) => {
    await inspectFixture(page, 'rtl-overflow', 'iPhone 15');
    const items = diagnosticItems(page, 'iPhone 15');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(
      'Page content overflows horizontally by 807px (1200px wide in a 393px viewport).'
    );
    await expect(items.nth(1)).toContainText('Off-viewport');
    await expect(items.nth(1)).toContainText(
      'Element extends outside the viewport (rect: -807–393, 0–40).'
    );

    const metrics = await readFrameMetrics(page);
    expect(metrics.htmlScrollWidth).toBe(1200);
    expect(metrics.innerWidth).toBe(393);
    expect(metrics.minRectLeft).toBeLessThan(-800);
  });

  test('an element entirely outside the viewport is reported', async ({
    page,
  }) => {
    await inspectFixture(page, 'offviewport');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(1);
    await expect(summaryBadge(page, '1 warning')).toBeVisible();
    await expect(items.first()).toContainText('Off-viewport');
    await expect(items.first()).toContainText(
      'Element is entirely outside the viewport (position: -200, 8).'
    );
  });

  test('many off-viewport elements are capped with a suppression note', async ({
    page,
  }) => {
    await inspectFixture(page, 'offviewport-many');
    const items = diagnosticItems(page, 'iPhone SE');
    // 25 identical siblings dedupe to a single finding (their element
    // signatures are identical), plus the suppression note.
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(
      'Element is entirely outside the viewport (position: -300, 0).'
    );
    await expect(items.last()).toContainText(
      '5 additional off-viewport elements not shown (cap reached).'
    );
  });

  test('content clipped by overflow:hidden produces no false positives', async ({
    page,
  }) => {
    await inspectFixture(page, 'clipped');
    await expect(
      inspectionsPanel(page).getByText('No issues found')
    ).toBeVisible();
    await expect(summaryBadge(page, '1 error')).toHaveCount(0);
  });

  test('nowrap text overflows its container', async ({ page }) => {
    await inspectFixture(page, 'text-overflow');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Text overflow');
    await expect(items.first()).toContainText(
      /Text overflows its container horizontally by ~\d+px\./
    );
    await expect(items.first().getByLabel('Severity: Warning')).toBeVisible();
  });

  test('fixed elements overlapping content and each other are reported', async ({
    page,
  }) => {
    await inspectFixture(page, 'fixed-overlap');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(3);

    // Two overlay × content overlaps plus one fixed-vs-fixed collision.
    await expect(
      items.filter({
        hasText: 'Fixed element overlaps meaningful page content with',
      })
    ).toHaveCount(2);
    await expect(
      items.filter({
        hasText: 'Fixed element overlaps fixed element in the same region with',
      })
    ).toHaveCount(1);

    // The collision attaches its partner as a related element.
    const collision = items.filter({
      hasText: 'overlaps fixed element in the same region',
    });
    await expect(collision.first()).toContainText('+ div#banner');

    // Expected page furniture (role=dialog) is never reported.
    await expect(items.filter({ hasText: '#modal' })).toHaveCount(0);
  });

  test('explicit overflow-x:auto downgrades overflow to a warning', async ({
    page,
  }) => {
    await inspectFixture(page, 'scroll-ok');
    const items = diagnosticItems(page, 'iPhone SE');
    // The wide element still sits outside the viewport (info), but the document
    // scrolls horizontally by design, so no error is raised.
    await expect(items).toHaveCount(2);
    await expect(summaryBadge(page, '1 warning')).toBeVisible();
    await expect(summaryBadge(page, '1 error')).toHaveCount(0);
    await expect(items.first()).toContainText(
      'Page content overflows horizontally by 825px (1200px wide in a 375px viewport).'
    );
    await expect(items.first().getByLabel('Severity: Warning')).toBeVisible();
    await expect(items.nth(1)).toContainText(
      'Element extends outside the viewport (rect: 0–1200, 0–40).'
    );
  });

  test('undersized touch targets are flagged, adequate ones are not', async ({
    page,
  }) => {
    await inspectFixture(page, 'touch-target');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);
    await expect(summaryBadge(page, '1 warning')).toBeVisible();
    await expect(summaryBadge(page, '1 info')).toBeVisible();
    await expect(items.first()).toContainText(
      'Interactive element is below the 24px minimum touch target size (20×20 CSS px).'
    );
    await expect(items.nth(1)).toContainText(
      'Interactive element is below the 44px recommended touch target size (30×30 CSS px).'
    );
    await expect(items.filter({ hasText: '48' })).toHaveCount(0);
  });

  test('cross-origin snapshots are reported unavailable', async ({ page }) => {
    await gotoApp(page);
    await setSharedUrl(page, `${CROSS_ORIGIN_URL}/fixtures/clean.html`);
    await addDevice(page, 'iPhone SE');
    // Cross-origin frames can't be introspected; wait on the app's own ready
    // status rather than racing waitForResponse with the navigate-on-add flow.
    await expect(
      previewControls(page).getByLabel('Preview status: Ready')
    ).toBeVisible();
    await startInspection(page);

    await expect(
      inspectionsPanel(page).getByText(/cross-origin and cannot be inspected/)
    ).toBeVisible();
    await expect(diagnosticItems(page, 'iPhone SE')).toHaveCount(0);
  });
});
