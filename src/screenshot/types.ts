/**
 * Screenshot subsystem types.
 *
 * Best-effort same-origin capture:
 * - Successful capture means the renderer produced a PNG Blob.
 * - The hand-rolled SVG foreignObject renderer is NOT pixel-perfect browser
 *   rendering. It does not faithfully reproduce every CSS feature, external
 *   resource, font, image, pseudo-element, animation, or rendering behavior.
 * - Failures surface as explicit statuses ('render-failed', 'cross-origin',
 *   'not-ready') — never silent, misleading PNGs.
 *
 * The interface is deliberately browser-agnostic so a future Playwright-based
 * backend can implement the same `ScreenshotCapturer` contract without
 * redesigning the UI or API.
 */

/** Source of truth for what a screenshot represents. */
export interface ScreenshotSpec {
  /** Viewport width in CSS pixels (orientation/custom-resolved). */
  readonly width: number;
  /** Viewport height in CSS pixels (orientation/custom-resolved). */
  readonly height: number;
}

/** Result status of a capture attempt. */
export type ScreenshotStatus =
  /** Renderer produced a PNG successfully. */
  | 'ok'
  /** The iframe's document is inaccessible (cross-origin). */
  | 'cross-origin'
  /** The preview is not loaded/ready yet. */
  | 'not-ready'
  /** The renderer failed to produce an image. */
  | 'render-failed';

/** Discriminated union of a capture attempt. */
export type ScreenshotResult =
  | {
      readonly status: 'ok';
      readonly blob: Blob;
      /** Object URL created from the PNG Blob (caller should revoke it). */
      readonly url: string;
      /** Sanitized, human-readable filename for the download. */
      readonly filename: string;
      /** CSS-pixel dimensions of the captured viewport. */
      readonly width: number;
      readonly height: number;
    }
  | { readonly status: Exclude<ScreenshotStatus, 'ok'> };

/**
 * The capture contract implemented by a concrete screenshot backend.
 *
 * A future browser-level backend (e.g. Playwright) can implement this same
 * interface; the UI/API never changes. Asynchronous because rasterization
 * (image load, canvas export, or a browser-level backend) is async.
 */
export interface ScreenshotCapturer {
  capture(
    source: ScreenshotSource,
    spec: ScreenshotSpec
  ): Promise<ScreenshotResult>;
}

/** Inputs a capturer needs to produce a screenshot. */
export interface ScreenshotSource {
  /** The live preview iframe element (if it exists). */
  readonly iframe: HTMLIFrameElement | null;
  /** Human-readable device name for the filename. */
  readonly deviceName: string;
}
