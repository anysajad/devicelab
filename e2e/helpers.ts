import { expect, type Locator, type Page } from '@playwright/test';

export const APP_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5178';
export const CROSS_ORIGIN_URL =
  process.env.CROSS_ORIGIN_URL ?? 'http://127.0.0.1:4178';

/** Absolute URL of a fixture served from the FIRST (app) dev server. */
export function fixtureUrl(name: string): string {
  return `${APP_URL}/fixtures/${name}.html`;
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
}

/** Set the shared URL (Enter commits it). */
export async function setSharedUrl(page: Page, url: string): Promise<void> {
  const input = page.getByLabel('Shared preview URL');
  await input.fill(url);
  await input.press('Enter');
}

/** Add a device via the Add Device menu by its display name. */
export async function addDevice(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add device', exact: true }).click();
  await page
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
}

/** Per-instance preview toolbar (unique to each instance card). */
export function previewControls(page: Page, index = 0): Locator {
  return page.locator('nav[aria-label="Preview controls"]').nth(index);
}

/** The preview iframe(s) created by the preview engine. */
export function previewFrames(page: Page): Locator {
  return page.locator('iframe[title="Device preview"]');
}

/**
 * Wait until the instance's document has finished loading inside the preview
 * iframe. `loading="lazy"` means the iframe may not start fetching until it is
 * near the layout viewport, so we scroll it into view first.
 */
export async function waitForFrameReady(page: Page, index = 0): Promise<void> {
  const frames = previewFrames(page);
  if (index > 0) {
    await frames.nth(index).scrollIntoViewIfNeeded();
  }
  await expect(frames.nth(index)).toHaveCount(1);
  await page.waitForFunction(
    (idx) => {
      const frames = document.querySelectorAll(
        'iframe[title="Device preview"]'
      );
      const f = frames[idx] as HTMLIFrameElement | undefined;
      if (!f) return false;
      const src = f.getAttribute('src') ?? '';
      if (!src.includes('/fixtures/')) return false;
      try {
        return f.contentDocument?.readyState === 'complete';
      } catch {
        return false;
      }
    },
    index,
    { timeout: 15_000 }
  );
}

/** Snapshot of the live geometry inside a preview iframe's document. */
export interface FrameMetrics {
  innerWidth: number;
  innerHeight: number;
  htmlScrollWidth: number;
  htmlClientWidth: number;
  bodyScrollWidth: number;
  iframeCssWidth: number;
  iframeCssHeight: number;
  /** Smallest rect.left among elements (used to detect RTL left overflow). */
  minRectLeft: number;
  /** Smallest element rect.left that extends past the left edge. */
  leftOverflowXs: number[];
}

export async function readFrameMetrics(
  page: Page,
  index = 0
): Promise<FrameMetrics> {
  return page.evaluate((idx) => {
    const frames = document.querySelectorAll('iframe[title="Device preview"]');
    const f = frames[idx] as HTMLIFrameElement | undefined;
    if (!f || !f.contentDocument || !f.contentWindow) {
      throw new Error('preview frame not ready');
    }
    const doc = f.contentDocument;
    const win = f.contentWindow;
    const lefts: number[] = [];
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left < -2) {
        lefts.push(Math.round(r.left));
      }
    }
    return {
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      htmlScrollWidth: doc.documentElement.scrollWidth,
      htmlClientWidth: doc.documentElement.clientWidth,
      bodyScrollWidth: doc.body?.scrollWidth ?? 0,
      iframeCssWidth: f.clientWidth,
      iframeCssHeight: f.clientHeight,
      minRectLeft: lefts.length > 0 ? Math.min(...lefts) : 0,
      leftOverflowXs: lefts.slice(0, 3),
    };
  }, index);
}

/** Turn on the workspace Inspect toggle and ensure the panel is visible. */
export async function startInspection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(inspectionsPanel(page)).toBeVisible();
}

export function inspectionsPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Inspection results' });
}

/** The diagnostics `<ul>` for a given device within the panel. */
export function diagnosticList(page: Page, deviceLabel: string): Locator {
  return inspectionsPanel(page).getByRole('list', {
    name: `${deviceLabel} diagnostics`,
  });
}

/** The rendered diagnostic `<li>` rows for a given device. */
export function diagnosticItems(page: Page, deviceLabel: string): Locator {
  return diagnosticList(page, deviceLabel).getByRole('listitem');
}

/** A summary badge in the panel's header row, e.g. "2 warnings". */
export function summaryBadge(page: Page, text: string): Locator {
  return inspectionsPanel(page).getByText(text, { exact: true });
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Parse the width/height from a PNG's IHDR chunk (big-endian at byte 16/20).
 * Throws if the buffer is not a PNG.
 */
export function pngDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  if (
    buffer.length < 24 ||
    !PNG_SIGNATURE.equals(buffer.subarray(0, 8)) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('not a valid PNG buffer');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
