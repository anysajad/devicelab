/**
 * Coordinate conversion utilities for the spike.
 *
 * These map between canvas display coordinates and Playwright page coordinates.
 * In the spike the canvas is 1:1 (no zoom), so the identity function applies.
 * A production implementation would handle effectiveZoom and DPR.
 */

/** Viewport dimensions of the Playwright page. */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Convert canvas/surface coordinates → Playwright page coordinates.
 *
 * Spike: identity (1:1 mapping, no zoom).
 * Production would account for effectiveZoom and devicePixelRatio.
 */
export function canvasToPage(
  canvasX: number,
  canvasY: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewport: ViewportSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dpr: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _effectiveZoom: number
): { x: number; y: number } {
  return { x: canvasX, y: canvasY };
}

/**
 * Convert Playwright page coordinates → canvas/surface coordinates.
 * Inverse of canvasToPage.
 */
export function pageToCanvas(
  pageX: number,
  pageY: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewport: ViewportSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dpr: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _effectiveZoom: number
): { x: number; y: number } {
  return { x: pageX, y: pageY };
}

/**
 * Convert mouse wheel delta to Playwright-compatible scroll values.
 * Spike: pass-through (no scaling).
 */
export function convertWheelDelta(
  delta: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewport: ViewportSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dpr: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _effectiveZoom: number
): number {
  return delta;
}