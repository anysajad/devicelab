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
  isLoopbackHostname,
  resolveOrientation,
  sanitizeUrl,
  ZOOM_STEP,
} from './previewUtils';

/** Default container dimensions used before the real container is measured. */
const DEFAULT_CONTAINER = { width: 800, height: 600 };

/**
 * How long to keep an iframe in `loading` before declaring the server
 * unresponsive (backstop for servers that accept the connection but never
 * complete the response). Mirrors Chrome's practical navigation hangs.
 */
export const PREVIEW_LOAD_TIMEOUT_MS = 10_000;

/**
 * Time limit for the loopback reachability probe. This is purely diagnostic —
 * the probe is never the authority for a successful load.
 */
export const PREVIEW_PROBE_TIMEOUT_MS = 3_000;

/**
 * Static, deterministic error for the https-host-embedding-http case. The
 * browser blocks mixed-content navigation at the network layer; nothing the
 * app does can bypass it, so this is reported synchronously.
 */
export const ERROR_MIXED_CONTENT =
  'This page is HTTPS, so the browser blocks embedding insecure http:// URLs. Serve DeviceLab over http:// or use an https:// dev server.';

/** Message shown when the loopback reachability probe fails. */
export function formatUnreachableMessage(host: string): string {
  return `Cannot reach ${host} — check that the dev server is running (connection refused or network error).`;
}

/** Message shown when a navigation never completes within the timeout. */
export function formatNotRespondingMessage(url: string): string {
  return `The server at ${url} is not responding. Check that the dev server is running and reachable.`;
}

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

  // Pending network-diagnostic work for the current load (cleared on every
  // complete load/error/reload/destroy).
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let probeController: AbortController | null = null;

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

  // --- Network-diagnostic helpers -----------------------------------------

  /** Whether the DeviceLab host page itself is served over HTTPS. */
  function hostIsSecure(): boolean {
    return (
      typeof window !== 'undefined' && window.location.protocol === 'https:'
    );
  }

  /** Abort any pending load timeout and reachability probe. */
  function clearPending(): void {
    if (loadTimer !== null) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    if (probeController !== null) {
      probeController.abort();
      probeController = null;
    }
  }

  /** Move the controller into the error lifecycle with a message. */
  function enterError(message: string): void {
    clearPending();
    lifecycle = 'error';
    error = message;
    emit();
  }

  /**
   * The loopback reachability probe is strictly a fast, honest diagnostic for
   * "is the dev server answering at all". It is scoped to loopback hosts so it
   * never becomes a generic arbitrary-origin probing mechanism.
   */
  function isLoopbackProbeEligible(url: string): boolean {
    if (typeof fetch !== 'function') return false;
    if (!/^https?:\/\//.test(url)) return false;
    try {
      return isLoopbackHostname(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  /**
   * Start the loopback reachability probe. On failure it surfaces a clear
   * "cannot reach the dev server" message, but ONLY while the frame is still
   * loading. A successful iframe load always wins over a probe result — the
   * probe is never the authority for a successful navigation.
   */
  function startReachabilityProbe(url: string): void {
    const controller = new AbortController();
    probeController = controller;
    const probeTimer = setTimeout(
      () => controller.abort(),
      PREVIEW_PROBE_TIMEOUT_MS
    );

    fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
      .catch(() => {
        // Ignore the failure once a newer probe has taken over (e.g., after a
        // reload), the controller is gone, or the frame has already loaded.
        if (
          !destroyed &&
          lifecycle === 'loading' &&
          probeController === controller
        ) {
          let host = url;
          try {
            host = new URL(url).host;
          } catch {
            // keep the raw URL as a fallback display value
          }
          enterError(formatUnreachableMessage(host));
        }
      })
      .finally(() => {
        clearTimeout(probeTimer);
        if (probeController === controller) {
          probeController = null;
        }
      });
  }

  /**
   * Backstop for servers that accept the connection but never deliver a
   * document. Only fires while the frame is still loading.
   */
  function startLoadTimeout(url: string): void {
    loadTimer = setTimeout(() => {
      loadTimer = null;
      if (!destroyed && lifecycle === 'loading') {
        enterError(formatNotRespondingMessage(url));
      }
    }, PREVIEW_LOAD_TIMEOUT_MS);
  }

  /**
   * Navigate the iframe to an already-sanitized URL, wiring up the timeout and
   * probing. Blank URLs and mixed-content targets are handled without a
   * navigation.
   */
  function beginNavigation(sanitized: string): void {
    if (!iframe || sanitized === 'about:blank') return;
    if (hostIsSecure() && sanitized.startsWith('http://')) {
      enterError(ERROR_MIXED_CONTENT);
      iframe.src = 'about:blank';
      return;
    }
    iframe.src = sanitized;
    startLoadTimeout(currentConfig?.url ?? sanitized);
    if (isLoopbackProbeEligible(sanitized)) {
      startReachabilityProbe(sanitized);
    }
  }

  function handleLoad(): void {
    if (destroyed) return;
    // The iframe fires 'load' on creation (about:blank) and on every completed
    // navigation. A non-blank script src means the target actually responded —
    // including after server-side redirects, which change the final src and
    // previously left the preview stuck loading forever.
    const src = iframe?.src ?? '';
    if (!src || src.startsWith('about:')) return;
    clearPending();
    if (currentConfig) {
      lifecycle = 'ready';
      error = null;
      emit();
    }
  }

  function handleError(): void {
    if (destroyed) return;
    enterError(
      'Failed to load preview. The URL may be unreachable or blocked by CORS/CSP headers.'
    );
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

    // Discard any outstanding timeout/probe from a previous load.
    clearPending();

    if (sanitized === 'about:blank') {
      // Empty or invalid input: keep the frame blank with no timers/probes and
      // settle into a quiet 'idle' state instead of spinning forever on
      // 'loading' (the first-use dead end).
      lifecycle = 'idle';
      error = null;
      iframe.src = 'about:blank';
      emit();
      return;
    }

    updateIframeDimensions();
    beginNavigation(sanitized);
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

    // Discard any outstanding timeout/probe before starting a fresh cycle.
    clearPending();

    const sanitized = sanitizeUrl(currentConfig.url);
    if (sanitized === 'about:blank') {
      lifecycle = 'idle';
      error = null;
      iframe.src = 'about:blank';
      emit();
      return;
    }
    beginNavigation(sanitized);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    clearPending();

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
