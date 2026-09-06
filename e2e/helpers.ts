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

/**
 * Wait until a CSS selector resolves to an element inside the preview frame's
 * document and return its live geometry + computed style. Reads from the top
 * page via contentDocument so it works for same-origin fixtures only.
 */
export interface ElementGeometry {
  rect: {
    x: number;
    y: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  computed: {
    position: string;
    display: string;
    visibility: string;
    overflowX: string;
    overflowY: string;
    whiteSpace: string;
    width: string;
    height: string;
  };
}

export async function readElementGeometry(
  page: Page,
  selector: string,
  index = 0
): Promise<ElementGeometry> {
  return page.evaluate(
    ([sel, idx]) => {
      const frames = document.querySelectorAll(
        'iframe[title="Device preview"]'
      );
      const f = frames[idx] as HTMLIFrameElement | undefined;
      if (!f || !f.contentDocument) throw new Error('preview frame not ready');
      const doc = f.contentDocument;
      const el = doc.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`element not found in fixture: ${sel}`);
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        rect: {
          x: r.x,
          y: r.y,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        },
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        computed: {
          position: s.position,
          display: s.display,
          visibility: s.visibility,
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          whiteSpace: s.whiteSpace,
          width: s.width,
          height: s.height,
        },
      };
    },
    [selector, index] as const
  );
}

/**
 * Fingerprint of the fixture inside the preview frame. Ignores only the
 * app-injected highlight `<style>` element (whose cleanup is asserted directly),
 * but INCLUDES the highlight class so callers can prove highlight is the sole
 * sanctioned mutation and that it cleans up to zero residue.
 */
export interface FrameFingerprint {
  innerWidth: number;
  innerHeight: number;
  scrollX: number;
  scrollY: number;
  docScrollWidth: number;
  docClientWidth: number;
  elements: Array<{
    tag: string;
    id: string;
    cls: string;
    left: string;
    top: string;
    width: string;
    height: string;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    computed: {
      position: string;
      display: string;
      overflowX: string;
      overflowY: string;
      whiteSpace: string;
    };
  }>;
}

export async function frameFingerprint(
  page: Page,
  index = 0
): Promise<FrameFingerprint> {
  return page.evaluate((idx) => {
    const frames = document.querySelectorAll('iframe[title="Device preview"]');
    const f = frames[idx] as HTMLIFrameElement | undefined;
    if (!f || !f.contentDocument || !f.contentWindow) {
      throw new Error('preview frame not ready');
    }
    const doc = f.contentDocument;
    const win = f.contentWindow;
    const elements: FrameFingerprint['elements'] = [];
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      if (el.id === 'devicelab-inspect-highlight-style') continue;
      const html = el as HTMLElement;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(html);
      elements.push({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        cls: Array.from(el.classList).join(' '),
        left: r.left.toFixed(1),
        top: r.top.toFixed(1),
        width: r.width.toFixed(1),
        height: r.height.toFixed(1),
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        computed: {
          position: s.position,
          display: s.display,
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          whiteSpace: s.whiteSpace,
        },
      });
    }
    return {
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      scrollX: win.scrollX,
      scrollY: win.scrollY,
      docScrollWidth: doc.documentElement.scrollWidth,
      docClientWidth: doc.documentElement.clientWidth,
      elements,
    };
  }, index);
}

/**
 * Class/computed-outline state of the given selectors inside the preview
 * frame. Used to assert the highlight is actually rendered (computed outline
 * solid), not merely applied as a class — the Chromium regression.
 */
export interface HighlightState {
  hasClass: boolean;
  outlineStyle: string;
}

export async function frameHighlightState(
  page: Page,
  targets: string[],
  index = 0
): Promise<Record<string, HighlightState>> {
  return page.evaluate(
    ([selList, idx]) => {
      const frames = document.querySelectorAll(
        'iframe[title="Device preview"]'
      );
      const f = frames[idx] as HTMLIFrameElement | undefined;
      if (!f || !f.contentDocument) throw new Error('preview frame not ready');
      const doc = f.contentDocument;
      const out: Record<string, HighlightState> = {};
      for (const sel of selList) {
        const el = doc.querySelector(sel);
        out[sel] = {
          hasClass: !!el?.classList.contains('devicelab-inspect-highlight'),
          outlineStyle: el ? getComputedStyle(el).outlineStyle : 'none',
        };
      }
      return out;
    },
    [targets, index] as const
  );
}

/** Whether the app's injected highlight rule is present in the frame. */
export async function frameHasHighlightStyle(
  page: Page,
  index = 0
): Promise<boolean> {
  return page.evaluate((idx) => {
    const frames = document.querySelectorAll('iframe[title="Device preview"]');
    const f = frames[idx] as HTMLIFrameElement | undefined;
    return !!(
      f &&
      f.contentDocument &&
      f.contentDocument.getElementById('devicelab-inspect-highlight-style')
    );
  }, index);
}

/**
 * Normalized diagnostic corpus: header summary badge texts plus, per device
 * group, the list aria-label and each item's collapsed text. Used to assert
 * that re-inspection across zoom levels produces identical results.
 */
export interface DiagnosticCorpus {
  badges: string[];
  groups: Array<{ label: string; items: string[] }>;
}

export async function diagnosticCorpus(page: Page): Promise<DiagnosticCorpus> {
  const panel = inspectionsPanel(page).first();
  return panel.evaluate((node) => {
    const badges = Array.from(
      node.querySelectorAll('div[aria-live="polite"] > span')
    ).map((s) => (s.textContent ?? '').trim());
    const groups = Array.from(
      node.querySelectorAll('ul[role="list"][aria-label$=" diagnostics"]')
    ).map((u) => ({
      label: u.getAttribute('aria-label') ?? '',
      items: Array.from(u.querySelectorAll('li')).map((li) =>
        (li.textContent ?? '').replace(/\s+/g, ' ').trim()
      ),
    }));
    return { badges, groups };
  });
}

/** Step the preview zoom (by clicking Zoom in/out) until the label is target%. */
export async function zoomToManual(
  page: Page,
  targetPercent: number,
  index = 0
): Promise<void> {
  const controls = previewControls(page, index);
  const label = controls.getByText(/^\d+%$/).first();
  await expect(label).toBeVisible();
  const read = async () => parseInt((await label.textContent()) ?? '100', 10);
  let current = await read();
  let guard = 0;
  while (current !== targetPercent && guard < 40) {
    if (targetPercent > current) {
      await controls
        .getByRole('button', { name: 'Zoom in', exact: true })
        .click();
    } else {
      await controls
        .getByRole('button', { name: 'Zoom out', exact: true })
        .click();
    }
    current = await read();
    guard += 1;
  }
  await expect(label).toHaveText(`${targetPercent}%`);
}

/**
 * The preview card that owns the given instance's toolbar. Grid/compare/focus
 * cards all share the `rounded-xl` card wrapper; `nth(index)` keeps the card
 * matched to the same instance ordering as previewControls(index).
 */
export function previewCard(page: Page, index = 0): Locator {
  return page
    .locator('div.rounded-xl')
    .filter({ has: previewControls(page, index) });
}

/**
 * The single scaled frame container inside a preview card. It is sized to the
 * device viewport (CSS pixels) and carries the engine's ONLY zoom transform
 * (`transform: scale(effectiveZoom)`), so its bounding box is the visual
 * footprint and the iframe's CSS viewport stays W×H.
 */
export function frameContainer(card: Locator): Locator {
  return card.locator('div.relative.overflow-hidden.rounded-2xl');
}

/** Parsed zoom percentage shown in an instance's toolbar (e.g. 110 for 110%). */
export async function zoomLabelValue(page: Page, index = 0): Promise<number> {
  const label = previewControls(page, index)
    .getByText(/^\d+%$/)
    .first();
  await expect(label).toBeVisible();
  return parseInt((await label.textContent()) ?? '100', 10);
}

/**
 * Commit custom viewport dimensions on an instance. Enter triggers the
 * atomic commit; invalid input must be rejected, preserving the last valid
 * stored dimensions.
 */
export async function customViewportCommit(
  page: Page,
  index: number,
  width: string,
  height: string
): Promise<void> {
  const controls = previewControls(page, index);
  await controls.getByLabel('Custom viewport width').fill(width);
  await controls.getByLabel('Custom viewport height').fill(height);
  await controls.getByLabel('Custom viewport height').press('Enter');
}

/** Switch an instance to the Custom viewport synthetic device. */
export async function selectCustomViewport(
  page: Page,
  index = 0
): Promise<void> {
  await previewControls(page, index)
    .getByLabel('Select device')
    .selectOption('__custom__');
}

/** Switch an instance to a preset device by its registry id. */
export async function selectPresetDeviceById(
  page: Page,
  index: number,
  deviceId: string
): Promise<void> {
  await previewControls(page, index)
    .getByLabel('Select device')
    .selectOption(deviceId);
}

/** Toggle an instance's orientation via the P/L buttons and onLoad wait. */
export async function clickOrientation(
  page: Page,
  orientation: 'portrait' | 'landscape',
  index = 0
): Promise<void> {
  const label =
    orientation === 'portrait'
      ? 'Portrait orientation'
      : 'Landscape orientation';
  await previewControls(page, index)
    .getByRole('button', { name: label, exact: true })
    .click();
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

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA pixel data, length = width * height * 4. */
  rgba: Buffer;
}

/**
 * Decode a PNG buffer in the page using Chromium's built-in decoder
 * (createImageBitmap -> canvas -> getImageData) so tests can assert on actual
 * pixels with zero new dependencies. Deterministic for solid-color fixtures.
 */
export async function decodePng(
  page: Page,
  buffer: Buffer
): Promise<DecodedPng> {
  const result = await page.evaluate(async (bytes: Uint8Array) => {
    const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas 2d context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, rgba: data };
  }, new Uint8Array(buffer));
  return {
    width: result.width,
    height: result.height,
    rgba: Buffer.from(result.rgba),
  };
}
