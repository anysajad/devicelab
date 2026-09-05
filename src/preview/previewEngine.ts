import type { DeviceDefinition } from '@/devices';
import type {
  PreviewConfig,
  PreviewController,
  PreviewLifecycle,
  PreviewState,
  ZoomMode,
} from './types';
import {
  clampZoom,
  computePreviewState,
  computeViewport,
  resolveOrientation,
  sanitizeUrl,
  ZOOM_STEP,
} from './previewUtils';

/** Default container dimensions used before the real container is measured. */
const DEFAULT_CONTAINER = { width: 800, height: 600 };

/**
 * Create an imperative, framework-agnostic preview controller.
 *
 * The controller owns a single `<iframe>` element, manages its lifecycle,
 * and computes all derived state (viewport, zoom, safe-area) from the
 * active PreviewConfig and the host container dimensions.
 *
 * The controller is the single authority for the zoom VALUE. It computes both
 * auto-fit zoom and manual zoom and exposes the resulting effectiveZoom in
 * state. The iframe's CSS viewport dimensions are never changed by zoom, and
 * the controller never writes a CSS transform to the iframe — the frame
 * component renders the zoom exactly once on its (single) scaling container.
 */
export function createPreviewController(): PreviewController {
  let iframe: HTMLIFrameElement | null = null;
  let destroyed = false;

  // Current inputs
  let currentConfig: PreviewConfig | null = null;
  let containerWidth = DEFAULT_CONTAINER.width;
  let containerHeight = DEFAULT_CONTAINER.height;

  // Zoom state
  let zoomMode: ZoomMode = 'fit';
  let manualZoom = 1;

  // Derived state
  let lifecycle: PreviewLifecycle = 'idle';
  let error: string | null = null;

  // Subscribers
  const listeners = new Set<(state: PreviewState) => void>();

  // --- Internal helpers ---------------------------------------------------

  function emit(): void {
    if (destroyed) return;
    const state = snapshot();
    for (const listener of listeners) {
      listener(state);
    }
  }

  function snapshot(): PreviewState {
    if (!currentConfig) {
      return {
        config: {
          url: '',
          device: {} as DeviceDefinition,
          orientation: 'portrait',
        },
        viewport: { width: 0, height: 0 },
        zoom: 1,
        zoomMode: 'fit',
        manualZoom: 1,
        effectiveZoom: 1,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        lifecycle: 'idle',
        error: null,
      };
    }

    return computePreviewState(
      currentConfig,
      containerWidth,
      containerHeight,
      lifecycle,
      error,
      zoomMode,
      manualZoom
    );
  }

  function updateIframeDimensions(): void {
    if (!iframe || !currentConfig) return;

    const orientation = resolveOrientation(
      currentConfig.device,
      currentConfig.orientation
    );
    const viewport = computeViewport(currentConfig.device, orientation);

    // The iframe's CSS dimensions are the device viewport (unscaled).
    // These NEVER change with zoom — the frame's single scaling container
    // handles visual zoom without touching the iframe's CSS viewport.
    iframe.style.width = `${viewport.width}px`;
    iframe.style.height = `${viewport.height}px`;
  }

  function handleLoad(): void {
    if (destroyed) return;
    // Blank iframe fires 'load' on creation — only transition to ready if
    // we have a real URL loaded.
    if (iframe?.src && iframe.src !== 'about:blank' && currentConfig) {
      const sanitized = sanitizeUrl(currentConfig.url);
      if (iframe.src === sanitized || iframe.src === `${sanitized}/`) {
        lifecycle = 'ready';
        error = null;
        emit();
      }
    }
  }

  function handleError(): void {
    if (destroyed) return;
    lifecycle = 'error';
    error =
      'Failed to load preview. The URL may be unreachable or blocked by CORS/CSP headers.';
    emit();
  }

  // --- Public API ---------------------------------------------------------

  function createIframe(): HTMLIFrameElement {
    const el = document.createElement('iframe');

    // Security: minimal sandbox permissions.
    // - allow-scripts: target app must execute JavaScript.
    // - allow-same-origin: required for cookies, localStorage, and
    //   fetch requests from the target app. Without this, the framed
    //   document is treated as a unique opaque origin, which breaks
    //   most real web applications. Trade-off: the framed document
    //   retains its origin, so the parent can access contentDocument
    //   for same-origin targets. This is necessary for legitimate
    //   development use (e.g. loading localhost apps).
    el.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups'
    );

    // Feature policy: grant access to common device APIs that target
    // apps may request. These are permission requests — the browser
    // still enforces user consent.
    el.setAttribute(
      'allow',
      'accelerometer; camera; geolocation; gyroscope; microphone; usb'
    );

    el.setAttribute('loading', 'lazy');
    el.setAttribute('title', 'Device preview');
    el.style.border = 'none';
    el.style.display = 'block';

    el.addEventListener('load', handleLoad);
    el.addEventListener('error', handleError);

    return el;
  }

  function load(config: PreviewConfig): void {
    if (destroyed) {
      // React StrictMode double-invokes effects in development: the simulated
      // unmount destroys this controller, then the remounted instance loads it
      // again. Reset the teardown state so the controller can start fresh.
      // IMPORTANT: do NOT clear `listeners` here — the remounted component has
      // already re-subscribed by the time this re-arm runs (effects fire before
      // the load() call), and clearing would permanently sever React state
      // updates (found by Playwright E2E validation: "Loading preview..."
      // overlay stuck, zoom frozen, screenshots failing).
      destroyed = false;
      lifecycle = 'idle';
      error = null;
      currentConfig = null;
      iframe = null;
    }

    const sanitized = sanitizeUrl(config.url);
    const effectiveOrientation = resolveOrientation(
      config.device,
      config.orientation
    );

    currentConfig = {
      ...config,
      orientation: effectiveOrientation,
    };

    if (!iframe) {
      iframe = createIframe();
    }

    lifecycle = 'loading';
    error = null;
    emit();

    updateIframeDimensions();

    // Setting src triggers the load lifecycle.
    iframe.src = sanitized;
  }

  function setContainerSize(width: number, height: number): void {
    if (destroyed) return;
    containerWidth = width;
    containerHeight = height;
    // emit() re-renders the frame, which applies the (possibly re-computed
    // fit) effectiveZoom to the frame's single scaling container.
    emit();
  }

  function reload(): void {
    if (destroyed || !iframe || !currentConfig) return;

    lifecycle = 'loading';
    error = null;
    emit();

    // Re-assigning src triggers a fresh load cycle.
    const sanitized = sanitizeUrl(currentConfig.url);
    iframe.src = sanitized;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (iframe) {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      iframe.remove();
      iframe = null;
    }

    listeners.clear();
    currentConfig = null;
  }

  function getState(): PreviewState {
    return snapshot();
  }

  function subscribe(listener: (state: PreviewState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getIframe(): HTMLIFrameElement | null {
    return iframe;
  }

  function setZoom(zoom: number): void {
    if (destroyed) return;
    zoomMode = 'manual';
    manualZoom = clampZoom(zoom);
    emit();
  }

  function zoomIn(): void {
    if (destroyed) return;
    zoomMode = 'manual';
    manualZoom = clampZoom(manualZoom + ZOOM_STEP);
    emit();
  }

  function zoomOut(): void {
    if (destroyed) return;
    zoomMode = 'manual';
    manualZoom = clampZoom(manualZoom - ZOOM_STEP);
    emit();
  }

  function setZoomMode(mode: ZoomMode): void {
    if (destroyed) return;
    zoomMode = mode;
    emit();
  }

  return {
    load,
    setContainerSize,
    reload,
    destroy,
    getState,
    subscribe,
    getIframe,
    setZoom,
    zoomIn,
    zoomOut,
    setZoomMode,
  };
}
