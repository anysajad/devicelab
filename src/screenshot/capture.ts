import { buildScreenshotFilename } from './filename';
import { renderXhtmlToPng, RendererDependencies } from './renderer';
import { serializeDocumentToXhtml } from './serialize';
import type {
  ScreenshotCapturer,
  ScreenshotResult,
  ScreenshotSource,
  ScreenshotSpec,
} from './types';

/**
 * Create the default (same-origin, best-effort) screenshot capturer.
 *
 * Status classification mirrors the inspection engine's same-origin detection:
 * - not-ready: no iframe or the preview hasn't finished loading.
 * - cross-origin: `contentDocument` is inaccessible (SecurityError) — honest
 *   unsupported status, never a misleading PNG.
 * - render-failed: the renderer could not produce an image (unsupported canvas,
 *   image load failure, serialization problem, etc.).
 * - ok: the renderer produced a PNG Blob at the CSS-pixel viewport dimensions.
 *
 * Fidelity is best-effort; see renderer.ts.
 */
export function createScreenshotCapturer(
  renderDeps: RendererDependencies = {}
): ScreenshotCapturer {
  return {
    async capture(
      source: ScreenshotSource,
      spec: ScreenshotSpec
    ): Promise<ScreenshotResult> {
      const { iframe } = source;
      if (!iframe) {
        return { status: 'not-ready' };
      }

      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        // Cross-origin access restriction.
        return { status: 'cross-origin' };
      }

      if (!doc) {
        // `contentDocument` returns NULL (rather than throwing) for
        // cross-origin frames — probing `contentWindow.location.href` throws a
        // SecurityError only for genuinely cross-origin frames. Without this,
        // loaded cross-origin previews would be mislabelled as "not ready".
        // (Found by Playwright E2E validation in real Chromium.)
        try {
          const win = iframe.contentWindow;
          if (win) {
            const href = win.location.href;
            void href;
          }
        } catch {
          return { status: 'cross-origin' };
        }
        return { status: 'not-ready' };
      }

      // Only capture fully-loaded documents (matches inspection semantics).
      if (doc.readyState !== 'complete' && doc.readyState !== 'interactive') {
        return { status: 'not-ready' };
      }

      const { width, height } = spec;
      if (width <= 0 || height <= 0) {
        return { status: 'render-failed' };
      }

      let serialized: string;
      try {
        serialized = serializeDocumentToXhtml(doc, source.deviceName);
      } catch {
        return { status: 'render-failed' };
      }
      if (!serialized) {
        return { status: 'render-failed' };
      }

      let blob: Blob | null;
      try {
        blob = await renderXhtmlToPng(serialized, width, height, renderDeps);
      } catch {
        return { status: 'render-failed' };
      }
      if (!blob) {
        return { status: 'render-failed' };
      }

      // Blob shape check — the renderer must have produced a PNG.
      if (blob.type !== 'image/png' && blob.type !== '') {
        return { status: 'render-failed' };
      }

      let url: string;
      try {
        url = window.URL.createObjectURL(blob);
      } catch {
        return { status: 'render-failed' };
      }

      return {
        status: 'ok',
        blob,
        url,
        filename: buildScreenshotFilename(source.deviceName, width, height),
        width,
        height,
      };
    },
  };
}
