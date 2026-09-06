import { createPreviewController } from '../previewEngine';
import type { PreviewController } from '../types';
import type { InspectionInaccessibleReason } from '@/inspection';
import type { PreviewBackend, PreviewInspectionAccess } from './types';

/**
 * Classify whether a live iframe's document can be inspected.
 *
 * This mirrors the inspection engine's honest same-origin classification so
 * the backend adapter reports exactly the same statuses the engine would —
 * without exposing the iframe element to UI consumers. The engine's
 * `inspectIframe` remains the canonical single path for running inspection.
 *
 * - pending: no iframe yet, or the frame's document is not ready.
 * - inaccessible: reading contentDocument threw (cross-origin) or the
 *   document is genuinely unavailable (about:blank reset, same-origin
 *   failure), with a frame URL pointing at another origin distinguished as
 *   cross-origin.
 * - available: a same-origin document that is safe to inspect.
 */
export function getIframeInspectionAccess(
  iframe: HTMLIFrameElement | null
): PreviewInspectionAccess {
  if (!iframe) {
    return { status: 'pending' };
  }

  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return { status: 'inaccessible', reason: 'cross-origin' };
  }

  if (!doc) {
    // `iframe.contentDocument` is null in Chromium both for cross-origin
    // frames and for frames whose page never became readable. Classify
    // cross-origin when the frame's own URL points at a different origin;
    // everything else stays honest as "contentDocument-unavailable".
    let reason: InspectionInaccessibleReason = 'contentDocument-unavailable';
    try {
      const parsed = new URL(iframe.src, window.location.href);
      if (
        parsed.protocol !== 'about:' &&
        parsed.origin !== 'null' &&
        parsed.origin !== window.location.origin
      ) {
        reason = 'cross-origin';
      }
    } catch {
      // Unparseable src — keep contentDocument-unavailable.
    }
    return { status: 'inaccessible', reason };
  }

  if (doc.readyState !== 'complete' && doc.readyState !== 'interactive') {
    return { status: 'pending' };
  }

  return { status: 'available', document: doc };
}

/**
 * Create the iframe backend — the Phase 1 implementation of the abstract
 * `PreviewBackend` contract.
 *
 * This adapts the existing iframe engine. It deliberately does NOT reimplement
 * loading, probing, timeouts, viewport/zoom/safe-area computation or iframe
 * lifecycle: all of that behavior is delegated to `createPreviewController()`.
 * The adapter only adds the three capabilities the shared UI needs
 * (`getSurface`, `getInspectionAccess`, `getScreenshotSource`) plus a `kind`
 * label. The underlying controller's imperative API is intentionally hidden
 * from UI consumers.
 */
export function createIframePreviewBackend(): PreviewBackend {
  const controller: PreviewController = createPreviewController();

  return {
    kind: 'iframe',

    load: (config) => controller.load(config),
    setContainerSize: (width, height) =>
      controller.setContainerSize(width, height),
    reload: () => controller.reload(),
    destroy: () => controller.destroy(),
    getState: () => controller.getState(),
    subscribe: (listener) => controller.subscribe(listener),

    getSurface: () => controller.getIframe(),
    getInspectionAccess: () =>
      getIframeInspectionAccess(controller.getIframe()),
    getScreenshotSource: () => {
      const iframe = controller.getIframe();
      const deviceName = controller.getState().config.device.name ?? 'preview';
      return { iframe, deviceName };
    },

    setZoom: (zoom) => controller.setZoom(zoom),
    zoomIn: () => controller.zoomIn(),
    zoomOut: () => controller.zoomOut(),
    setZoomMode: (mode) => controller.setZoomMode(mode),
  };
}
