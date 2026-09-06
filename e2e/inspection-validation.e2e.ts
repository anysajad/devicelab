import { expect, test, type Page } from '@playwright/test';

import {
  addDevice,
  diagnosticCorpus,
  diagnosticItems,
  fixtureUrl,
  frameFingerprint,
  frameHasHighlightStyle,
  frameHighlightState,
  gotoApp,
  inspectionsPanel,
  previewControls,
  readElementGeometry,
  readFrameMetrics,
  setSharedUrl,
  startInspection,
  summaryBadge,
  waitForFrameReady,
  zoomToManual,
  type ElementGeometry,
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

/** Axis-aligned intersection area of two rects, derived from live geometry. */
function intersectionArea(
  a: ElementGeometry['rect'],
  b: ElementGeometry['rect']
): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

test.describe('diagnostic validation in a real browser', () => {
  test('document-level horizontal overflow numbers match measured browser geometry', async ({
    page,
  }) => {
    await inspectFixture(page, 'overflow');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    const metrics = await readFrameMetrics(page);
    const geo = await readElementGeometry(page, 'div#wide');
    expect(metrics.innerWidth).toBe(375);
    expect(geo.rect.width).toBeCloseTo(1200, 0);
    expect(metrics.bodyScrollWidth).toBe(1200);

    // Derive the expected report from the frame's own numbers rather than
    // hard-coding them — the checker must agree with the browser.
    await expect(items.first()).toContainText(
      `Page content overflows horizontally by ${metrics.bodyScrollWidth - metrics.innerWidth}px (${metrics.bodyScrollWidth}px wide in a ${metrics.innerWidth}px viewport).`
    );
    await expect(items.first().getByLabel('Severity: Error')).toBeVisible();
  });

  test('overflow up to 20px is reported as info', async ({ page }) => {
    await inspectFixture(page, 'overflow-minor');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    const metrics = await readFrameMetrics(page);
    const geo = await readElementGeometry(page, 'div#wide');
    await expect(items.first()).toContainText(
      `Page content overflows horizontally by ${Math.round(geo.rect.right) - metrics.innerWidth}px (${Math.round(geo.rect.right)}px wide in a ${metrics.innerWidth}px viewport).`
    );
    await expect(items.first().getByLabel('Severity: Info')).toBeVisible();
    await expect(items.nth(1)).toContainText(
      `Element extends outside the viewport (rect: ${Math.round(geo.rect.left)}–${Math.round(geo.rect.right)}, ${Math.round(geo.rect.top)}–${Math.round(geo.rect.bottom)}).`
    );
  });

  test('overflow between 20px and 200px is reported as a warning', async ({
    page,
  }) => {
    await inspectFixture(page, 'overflow-small');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);
    await expect(summaryBadge(page, '1 warning')).toBeVisible();
    await expect(summaryBadge(page, '1 error')).toHaveCount(0);

    const metrics = await readFrameMetrics(page);
    const geo = await readElementGeometry(page, 'div#wide');
    await expect(items.first()).toContainText(
      `Page content overflows horizontally by ${Math.round(geo.rect.right) - metrics.innerWidth}px (${Math.round(geo.rect.right)}px wide in a ${metrics.innerWidth}px viewport).`
    );
    await expect(items.first().getByLabel('Severity: Warning')).toBeVisible();
  });

  test('the shallowest off-screen ancestor is the reported root cause', async ({
    page,
  }) => {
    await inspectFixture(page, 'offviewport-nested');
    const items = diagnosticItems(page, 'iPhone SE');
    // The nested child is fully off-screen too, but the off-screen container
    // is the root cause — only one finding.
    await expect(items).toHaveCount(1);

    const container = await readElementGeometry(page, '#container');
    const child = await readElementGeometry(page, '.child');
    expect(container.rect.left).toBe(-300);
    expect(container.rect.top).toBe(8);
    expect(child.rect.left).toBe(-280);

    await expect(items.first()).toContainText('Off-viewport');
    await expect(items.first()).toContainText('div#container');
    await expect(items.first()).toContainText(
      `Element is entirely outside the viewport (position: ${Math.round(container.rect.left)}, ${Math.round(container.rect.top)}).`
    );
  });

  test('content printed by an explicit-height clipping box is reported as vertical info', async ({
    page,
  }) => {
    await inspectFixture(page, 'text-overflow-vertical');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(1);

    const geo = await readElementGeometry(page, '.clipv');
    expect(geo.clientHeight).toBe(40);
    const overflow = Math.round(geo.scrollHeight - geo.clientHeight);
    expect(overflow).toBeGreaterThan(0);

    await expect(items.first()).toContainText('Text overflow');
    await expect(items.first()).toContainText(
      `Text overflows its container vertically by ~${overflow}px. Content is clipped by the container.`
    );
    await expect(items.first().getByLabel('Severity: Info')).toBeVisible();
  });

  test('wrappable horizontal overflow is marked uncertain in real Chromium', async ({
    page,
  }) => {
    await inspectFixture(page, 'text-overflow-uncertain');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(1);

    const geo = await readElementGeometry(page, '.uwrap');
    // The container wraps by default, so the overflow may reflow — the check
    // must report this honestly instead of asserting a hard "clipped" state.
    expect(geo.computed.whiteSpace).toBe('normal');
    expect(geo.scrollWidth).toBeGreaterThan(geo.clientWidth + 2);

    await expect(items.first()).toContainText(
      'Text overflows its container horizontally by ~'
    );
    await expect(items.first()).toContainText(
      'Text wraps by default (white-space: normal)'
    );
    await expect(items.first()).toContainText(
      'overflow may be reflowed rather than clipped'
    );
    await expect(items.first().getByLabel('Severity: Warning')).toBeVisible();
  });

  test('fixed/sticky overlap areas derive from independently measured geometry', async ({
    page,
  }) => {
    await inspectFixture(page, 'fixed-overlap');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(3);

    const header = await readElementGeometry(page, '#site-header');
    const banner = await readElementGeometry(page, '#banner');
    const modal = await readElementGeometry(page, '#modal');
    const main = await readElementGeometry(page, 'main');
    expect(header.rect).toMatchObject({
      left: 0,
      top: 0,
      width: 375,
      height: 120,
    });
    expect(banner.rect).toMatchObject({
      left: 0,
      top: 0,
      width: 375,
      height: 40,
    });
    expect(main.rect.height).toBe(300);

    const headerBanner = Math.round(intersectionArea(header.rect, banner.rect));
    const headerMain = Math.round(intersectionArea(header.rect, main.rect));
    const bannerMain = Math.round(intersectionArea(banner.rect, main.rect));

    await expect(
      items.filter({ hasText: 'overlaps meaningful page content with' })
    ).toHaveCount(2);
    await expect(
      items.filter({
        hasText: `overlaps meaningful page content with ${headerMain}px²`,
      })
    ).toHaveCount(1);
    await expect(
      items.filter({
        hasText: `overlaps meaningful page content with ${bannerMain}px²`,
      })
    ).toHaveCount(1);

    const collision = items.filter({
      hasText: 'overlaps fixed element in the same region',
    });
    await expect(collision).toHaveCount(1);
    await expect(collision.first()).toContainText(
      `Fixed element overlaps fixed element in the same region with ${headerBanner}px² of shared area.`
    );
    await expect(collision.first()).toContainText('+ div#banner');

    // Expected modal furniture is treated as an overlay, never the offender.
    await expect(items.filter({ hasText: '#modal' })).toHaveCount(0);
    expect(modal.rect.width).toBe(375);
  });

  test('touch-target thresholds map to measured element sizes', async ({
    page,
  }) => {
    await inspectFixture(page, 'touch-target');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    const small = await readElementGeometry(page, 'button:nth-of-type(1)');
    const medium = await readElementGeometry(page, 'button:nth-of-type(2)');
    const adequate = await readElementGeometry(page, 'button:nth-of-type(3)');
    expect(small.rect).toMatchObject({ width: 20, height: 20 });
    expect(medium.rect).toMatchObject({ width: 30, height: 30 });
    expect(adequate.rect).toMatchObject({ width: 48, height: 48 });

    await expect(items.first()).toContainText(
      'Interactive element is below the 24px minimum touch target size (20×20 CSS px).'
    );
    await expect(items.first().getByLabel('Severity: Warning')).toBeVisible();
    await expect(items.nth(1)).toContainText(
      'Interactive element is below the 44px recommended touch target size (30×30 CSS px).'
    );
    await expect(items.nth(1).getByLabel('Severity: Info')).toBeVisible();
    await expect(items.filter({ hasText: '48' })).toHaveCount(0);
  });

  test('undersized targets are capped with a suppression note', async ({
    page,
  }) => {
    await inspectFixture(page, 'touch-target-caps');
    const items = diagnosticItems(page, 'iPhone SE');
    // 25 undersized buttons → 20 reported + 1 suppression note; the adequate
    // (44×44) and hidden buttons never appear.
    await expect(items).toHaveCount(21);
    await expect(summaryBadge(page, '19 warnings')).toBeVisible();
    await expect(summaryBadge(page, '2 info')).toBeVisible();

    await expect(items.first()).toContainText(
      'Interactive element is below the 24px minimum touch target size (5×44 CSS px).'
    );
    await expect(items.nth(19)).toContainText('(24×44 CSS px)');
    await expect(items.last()).toContainText(
      '5 additional undersized interactive elements not shown (cap reached).'
    );

    // Sizes 25–29 were suppressed (only the count remains).
    await expect(items.filter({ hasText: '(25×44 CSS px)' })).toHaveCount(0);
    await expect(items.filter({ hasText: '(29×44 CSS px)' })).toHaveCount(0);
    await expect(items.filter({ hasText: '#adequate' })).toHaveCount(0);
    await expect(items.filter({ hasText: '#hidden' })).toHaveCount(0);
  });

  test('rescan clears stale results after the URL changes', async ({
    page,
  }) => {
    await gotoApp(page);
    await setSharedUrl(page, fixtureUrl('overflow'));
    await addDevice(page, 'iPhone SE');
    await waitForFrameReady(page);
    await startInspection(page);
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    await setSharedUrl(page, fixtureUrl('clean'));
    await waitForFrameReady(page);
    // Results from the previous document persist until an explicit Rescan.
    await expect(items).toHaveCount(2);

    await page.getByRole('button', { name: 'Rescan' }).click();
    await expect(
      inspectionsPanel(page).getByText('No issues found')
    ).toBeVisible();
    await expect(items).toHaveCount(0);
    await expect(summaryBadge(page, '1 error')).toHaveCount(0);
  });

  test('re-inspection at 100%/90%/200% zoom yields identical results and an unchanged CSS viewport', async ({
    page,
  }) => {
    await inspectFixture(page, 'overflow');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    const snapshots: Array<{
      corpus: Awaited<ReturnType<typeof diagnosticCorpus>>;
      rect: ElementGeometry['rect'];
    }> = [];
    for (const zoom of [100, 90, 200]) {
      await zoomToManual(page, zoom);
      await expect(items).toHaveCount(2);
      const corpus = await diagnosticCorpus(page);
      const geo = await readElementGeometry(page, 'div#wide');
      const metrics = await readFrameMetrics(page);
      // Zoom must never change the CSS viewport the diagnostics are based on.
      expect(metrics.innerWidth).toBe(375);
      expect(metrics.bodyScrollWidth).toBe(1200);
      snapshots.push({ corpus, rect: geo.rect });
    }

    // Identical findings and identical geometry at every zoom level.
    expect(snapshots[1]!.corpus).toEqual(snapshots[0]!.corpus);
    expect(snapshots[2]!.corpus).toEqual(snapshots[0]!.corpus);
    expect(snapshots[1]!.rect).toEqual(snapshots[0]!.rect);
    expect(snapshots[2]!.rect).toEqual(snapshots[0]!.rect);
  });

  test('custom viewport dimensions drive the diagnostics geometry', async ({
    page,
  }) => {
    await gotoApp(page);
    await setSharedUrl(page, fixtureUrl('overflow'));
    await addDevice(page, 'iPhone SE');
    await waitForFrameReady(page);

    await previewControls(page)
      .getByLabel('Select device')
      .selectOption({ label: 'Custom viewport...' });
    await page.getByLabel('Custom viewport width').fill('500');
    await page.getByLabel('Custom viewport height').fill('800');
    await page.getByLabel('Custom viewport height').press('Enter');
    await waitForFrameReady(page);
    await startInspection(page);

    const items = diagnosticItems(page, 'Custom');
    await expect(items).toHaveCount(2);

    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(500);
    expect(metrics.innerHeight).toBe(800);
    await expect(items.first()).toContainText(
      `Page content overflows horizontally by ${metrics.bodyScrollWidth - metrics.innerWidth}px (${metrics.bodyScrollWidth}px wide in a ${metrics.innerWidth}px viewport).`
    );
  });

  test('landscape orientation drives the diagnostics geometry', async ({
    page,
  }) => {
    await gotoApp(page);
    await setSharedUrl(page, fixtureUrl('overflow'));
    await addDevice(page, 'iPhone SE');
    await waitForFrameReady(page);
    await previewControls(page)
      .getByRole('button', { name: 'Landscape orientation' })
      .click();
    await waitForFrameReady(page);
    await startInspection(page);

    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(2);

    const metrics = await readFrameMetrics(page);
    expect(metrics.innerWidth).toBe(667);
    expect(metrics.innerHeight).toBe(375);
    await expect(items.first()).toContainText(
      `Page content overflows horizontally by ${metrics.bodyScrollWidth - metrics.innerWidth}px (${metrics.bodyScrollWidth}px wide in a ${metrics.innerWidth}px viewport).`
    );
  });

  test('inspection never mutates the framed page', async ({ page }) => {
    await gotoApp(page);
    await setSharedUrl(page, fixtureUrl('overflow'));
    await addDevice(page, 'iPhone SE');
    await waitForFrameReady(page);

    const before = await frameFingerprint(page);
    await startInspection(page);
    const whileOpen = await frameFingerprint(page);
    expect(whileOpen).toEqual(before);

    await page.getByRole('button', { name: 'Close inspection panel' }).click();
    const afterClose = await frameFingerprint(page);
    expect(afterClose).toEqual(before);
  });

  test('highlighting renders visibly in the frame and cleans up to zero residue (Chromium regression)', async ({
    page,
  }) => {
    await inspectFixture(page, 'fixed-overlap');
    const items = diagnosticItems(page, 'iPhone SE');
    await expect(items).toHaveCount(3);

    const clean = await frameFingerprint(page);

    // Single highlight on the first item.
    await items
      .first()
      .getByRole('button', { name: 'Highlight element in preview' })
      .click();
    let state = await frameHighlightState(page, [
      '#site-header',
      '#banner',
      '#modal',
    ]);
    // Regression: the class was applied but no CSS rule existed in the framed
    // document, so the highlight computed to outline:none — invisible. The
    // injected rule must make it a solid visible outline.
    expect(state['#site-header']).toMatchObject({
      hasClass: true,
      outlineStyle: 'solid',
    });
    expect(state['#banner']).toMatchObject({ hasClass: false });
    expect(state['#modal']).toMatchObject({ hasClass: false });
    expect(await frameHasHighlightStyle(page)).toBe(true);
    expect(await frameFingerprint(page)).not.toEqual(clean);

    // Toggle off: the class, the injected rule, and everything else vanish.
    await items
      .first()
      .getByRole('button', { name: 'Remove highlight' })
      .click();
    state = await frameHighlightState(page, ['#site-header']);
    expect(state['#site-header']).toMatchObject({ hasClass: false });
    expect(await frameHasHighlightStyle(page)).toBe(false);
    expect(await frameFingerprint(page)).toEqual(clean);

    // Dual highlight: the collision item marks both the element and its
    // related partner, leaving overlay furniture untouched.
    const collision = items.filter({
      hasText: 'overlaps fixed element in the same region',
    });
    await collision
      .first()
      .getByRole('button', { name: 'Highlight element in preview' })
      .click();
    state = await frameHighlightState(page, [
      '#site-header',
      '#banner',
      '#modal',
    ]);
    expect(state['#site-header']).toMatchObject({
      hasClass: true,
      outlineStyle: 'solid',
    });
    expect(state['#banner']).toMatchObject({
      hasClass: true,
      outlineStyle: 'solid',
    });
    expect(state['#modal']).toMatchObject({ hasClass: false });

    await collision
      .first()
      .getByRole('button', { name: 'Remove highlight' })
      .click();
    expect(await frameHasHighlightStyle(page)).toBe(false);
    expect(await frameFingerprint(page)).toEqual(clean);
  });
});
