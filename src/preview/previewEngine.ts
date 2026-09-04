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
  computeEffectiveZoom,
  computePreviewState,
  computeViewport,
  computeZoom,
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
 * The controller is the single authority for all zoom/scaling. It manages
 * both auto-fit zoom and manual zoom. The iframe's CSS viewport dimensions
 * are never changed by zoom — only the visual `transform: scale()` is affected.
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

  function getEffectiveZoom(): number {
    if (!currentConfig) return 1;
    const orientation = resolveOrientation(
      currentConfig.device,
      currentConfig.orientation
    );
    const viewport = computeViewport(currentConfig.device, orientation);
    const autoFitZoom = computeZoom(viewport, containerWidth, containerHeight);
    return computeEffectiveZoom(zoomMode, autoFitZoom, manualZoom);
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
    // These NEVER change with zoom — only the visual transform is affected.
    iframe.style.width = `${viewport.width}px`;
    iframe.style.height = `${viewport.height}px`;
  }

  function updateIframeTransform(): void {
    if (!iframe || !currentConfig) return;

    const effectiveZoom = getEffectiveZoom();

    // Host-side visual scaling. The iframe content always sees its correct
    // CSS pixel dimensions; transform: scale only affects visual presentation.
    iframe.style.transform = `scale(${effectiveZoom})`;
    iframe.style.transformOrigin = 'top left';
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
    if (destroyed) return;

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
    updateIframeTransform();

    // Setting src triggers the load lifecycle.
    iframe.src = sanitized;
  }

  function setContainerSize(width: number, height: number): void {
    if (destroyed) return;
    containerWidth = width;
    containerHeight = height;
    updateIframeTransform();
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
    updateIframeTransform();
    emit();
  }

  function zoomIn(): void {
    if (destroyed) return;
    zoomMode = 'manual';
    manualZoom = clampZoom(manualZoom + ZOOM_STEP);
    updateIframeTransform();
    emit();
  }

  function zoomOut(): void {
    if (destroyed) return;
    zoomMode = 'manual';
    manualZoom = clampZoom(manualZoom - ZOOM_STEP);
    updateIframeTransform();
    emit();
  }

  function setZoomMode(mode: ZoomMode): void {
    if (destroyed) return;
    zoomMode = mode;
    updateIframeTransform();
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
