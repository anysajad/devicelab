/**
 * Browser preview backend — Phase 2B-2 of the Playwright companion integration.
 *
 * This backend communicates with a local companion process over WebSocket
 * to control a real Chromium browser instance. It implements the abstract
 * `PreviewBackend` contract, allowing the existing PreviewInstance/usePreview
 * to operate without knowing the backend is Playwright-based.
 *
 * Phase 2B-2 adds:
 * - Screenshot frame consumption
 * - Canvas visual surface
 * - Frame performance instrumentation
 */

import type {
  PreviewBackend,
  PreviewBackendKind,
  PreviewInspectionAccess,
  PreviewSurface,
} from './types';
import type {
  PreviewConfig,
  PreviewState,
  PreviewLifecycle,
  ZoomMode,
  ComputedViewport,
} from '../types';
import type { DeviceDefinition } from '@/devices';
import type { ScreenshotSource } from '@/screenshot';
import type { SafeAreaInsets } from '@/devices';
import { createCompanionClient } from './browserCompanionClient';
import type { ClientEvent, FrameData } from './browserCompanionClient';
import {
  createBrowserPreviewSurface,
  type BrowserPreviewSurface,
  type SurfaceInputEvent,
} from './browserPreviewSurface';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BrowserPreviewBackendConfig {
  /** WebSocket endpoint URL, e.g. ws://127.0.0.1:5199/ws */
  readonly endpoint: string;
  /** Authentication token */
  readonly token: string;
}

// ---------------------------------------------------------------------------
// Companion lifecycle → Preview lifecycle mapping
// ---------------------------------------------------------------------------

/**
 * Map companion session lifecycle states to preview lifecycle states.
 */
function mapLifecycle(
  companionLifecycle: string,
  hasUrl: boolean
): PreviewLifecycle {
  switch (companionLifecycle) {
    case 'idle':
      return 'idle';
    case 'starting':
      return 'loading';
    case 'ready':
      return hasUrl ? 'ready' : 'idle';
    case 'loading':
      return 'loading';
    case 'error':
      return 'error';
    case 'closed':
      return 'error';
    default:
      return 'idle';
  }
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_VIEWPORT: ComputedViewport = { width: 375, height: 667 };

const DEFAULT_CONFIG: PreviewConfig = {
  url: '',
  device: {} as DeviceDefinition,
  orientation: 'portrait',
};

const DEFAULT_SAFE_AREA: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function createDefaultState(): PreviewState {
  return {
    config: DEFAULT_CONFIG,
    viewport: DEFAULT_VIEWPORT,
    zoom: 1,
    zoomMode: 'fit',
    manualZoom: 1,
    effectiveZoom: 1,
    safeArea: DEFAULT_SAFE_AREA,
    lifecycle: 'idle',
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Frame performance metrics
// ---------------------------------------------------------------------------

export interface FrameMetrics {
  /** Total frames received. */
  framesReceived: number;
  /** Current FPS (frames in last second). */
  fps: number;
  /** Average frame size in bytes. */
  avgFrameSize: number;
  /** Total bytes received. */
  totalBytes: number;
  /** Timestamp of last frame. */
  lastFrameTime: number;
}

function createFrameMetrics(): FrameMetrics {
  return {
    framesReceived: 0,
    fps: 0,
    avgFrameSize: 0,
    totalBytes: 0,
    lastFrameTime: 0,
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a browser preview backend that communicates with a local companion.
 *
 * This backend:
 * - Connects to the companion via WebSocket
 * - Creates a browser session with the requested viewport
 * - Loads URLs via Playwright
 * - Receives screenshot frames and renders them on a canvas
 * - Reports state back to the preview layer
 */
export function createBrowserPreviewBackend(
  config: BrowserPreviewBackendConfig
): PreviewBackend {
  const client = createCompanionClient({
    endpoint: config.endpoint,
    token: config.token,
  });

  let state = createDefaultState();
  let sessionId: string | null = null;
  let destroyed = false;
  const listeners = new Set<(state: PreviewState) => void>();

  // Zoom state
  let zoomMode: ZoomMode = 'fit';
  let manualZoom = 1;
  let containerWidth = 800;
  let containerHeight = 600;

  // Surface and frame state
  let surface: BrowserPreviewSurface | null = null;
  let container: HTMLDivElement | null = null;
  const frameMetrics = createFrameMetrics();
  const frameTimestamps: number[] = [];

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  function computeEffectiveZoom(): number {
    if (zoomMode === 'manual') {
      return manualZoom;
    }
    const { width, height } = state.viewport;
    if (width === 0 || height === 0) return 1;
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    return Math.min(scaleX, scaleY, 1);
  }

  function updateState(updates: Partial<PreviewState>): void {
    state = { ...state, ...updates };
    state = { ...state, effectiveZoom: computeEffectiveZoom() };
    emit();
  }

  function emit(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  // ---------------------------------------------------------------------------
  // Frame handling
  // ---------------------------------------------------------------------------

  function updateFrameMetrics(frameSize: number): void {
    const now = Date.now();
    frameMetrics.framesReceived++;
    frameMetrics.totalBytes += frameSize;
    frameMetrics.lastFrameTime = now;
    frameMetrics.avgFrameSize =
      frameMetrics.totalBytes / frameMetrics.framesReceived;

    // Track timestamps for FPS calculation
    frameTimestamps.push(now);
    // Keep only timestamps from the last second
    const oneSecAgo = now - 1000;
    while (
      frameTimestamps.length > 0 &&
      (frameTimestamps[0] ?? 0) < oneSecAgo
    ) {
      frameTimestamps.shift();
    }
    frameMetrics.fps = frameTimestamps.length;
  }

  function handleFrame(frameData: FrameData): void {
    if (destroyed) return;

    // Ignore frames from stale sessions
    if (frameData.sessionId !== sessionId) return;

    // Update metrics
    const payloadBytes = Math.ceil((frameData.payload.length * 3) / 4);
    updateFrameMetrics(payloadBytes);

    // Draw frame to surface
    surface?.drawFrame(frameData.payload, frameData.width, frameData.height);
  }

  // ---------------------------------------------------------------------------
  // Client event handling
  // ---------------------------------------------------------------------------

  function handleClientEvent(event: ClientEvent): void {
    if (destroyed) return;

    switch (event.type) {
      case 'lifecycle': {
        const data = event.data as {
          sessionId: string;
          lifecycle: string;
          error?: string;
        };
        if (data.sessionId === sessionId) {
          const lifecycle = mapLifecycle(
            data.lifecycle,
            state.config.url !== ''
          );
          updateState({
            lifecycle,
            error: data.error ?? state.error,
          });
        }
        break;
      }
      case 'closed': {
        const data = event.data as { sessionId: string; reason?: string };
        if (data.sessionId === sessionId) {
          sessionId = null;
          updateState({
            lifecycle: 'error',
            error: data.reason ?? 'Session closed',
          });
        }
        break;
      }
      case 'shutdown': {
        sessionId = null;
        updateState({
          lifecycle: 'error',
          error: 'Companion shut down',
        });
        break;
      }
      case 'stateChange': {
        const data = event.data as { state: string };
        if (data.state === 'disconnected' && sessionId) {
          sessionId = null;
          updateState({
            lifecycle: 'error',
            error: 'Connection lost',
          });
        }
        break;
      }
      case 'frame': {
        handleFrame(event.data as FrameData);
        break;
      }
    }
  }

  client.on(handleClientEvent);

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  async function initializeSession(viewport: ComputedViewport): Promise<void> {
    try {
      await client.connect();

      const response = await client.request('session.create', {
        viewport: { width: viewport.width, height: viewport.height },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result as { sessionId: string };
      sessionId = result.sessionId;
    } catch (err) {
      updateState({
        lifecycle: 'error',
        error: `Failed to create session: ${String(err)}`,
      });
      throw err;
    }
  }

  async function loadUrl(url: string): Promise<void> {
    if (!sessionId) {
      throw new Error('No session');
    }

    try {
      updateState({ lifecycle: 'loading', error: null });

      const response = await client.request('session.load', {
        sessionId,
        url,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (err) {
      updateState({
        lifecycle: 'error',
        error: `Failed to load URL: ${String(err)}`,
      });
      throw err;
    }
  }

  async function reloadUrl(): Promise<void> {
    if (!sessionId) {
      throw new Error('No session');
    }

    try {
      updateState({ lifecycle: 'loading', error: null });

      const response = await client.request('session.reload', {
        sessionId,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (err) {
      updateState({
        lifecycle: 'error',
        error: `Failed to reload: ${String(err)}`,
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Surface management
  // ---------------------------------------------------------------------------

  function handleSurfaceInput(event: SurfaceInputEvent): void {
    if (destroyed || !sessionId) return;

    switch (event.type) {
      case 'move':
      case 'down':
      case 'up':
      case 'click':
      case 'doubleClick':
        extendedBackend.sendPointerInput(
          event.type,
          event.x,
          event.y,
          event.button,
          event.clickCount
        );
        break;
      case 'wheel':
        extendedBackend.sendWheelInput(event.deltaX, event.deltaY);
        break;
      case 'keyDown':
      case 'keyUp':
      case 'type':
        extendedBackend.sendKeyboardInput(event.type, event.key, event.text);
        break;
    }
  }

  function ensureSurface(): void {
    if (!container || surface) return;

    surface = createBrowserPreviewSurface({
      container,
      width: state.viewport.width,
      height: state.viewport.height,
      onInput: handleSurfaceInput,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const backend: PreviewBackend = {
    kind: 'browser' as PreviewBackendKind,

    load: (config: PreviewConfig) => {
      if (destroyed) return;

      const viewport: ComputedViewport = {
        width: config.device.viewport?.width ?? 375,
        height: config.device.viewport?.height ?? 667,
      };

      updateState({
        config,
        viewport,
        lifecycle: 'loading',
        error: null,
      });

      // Resize surface if it exists
      surface?.resize(viewport.width, viewport.height);

      // Initialize session if needed, then load
      if (!sessionId) {
        initializeSession(viewport)
          .then(() => loadUrl(config.url))
          .catch(() => {
            // Error already handled in state
          });
      } else {
        loadUrl(config.url).catch(() => {
          // Error already handled in state
        });
      }
    },

    setContainerSize: (width: number, height: number) => {
      containerWidth = width;
      containerHeight = height;
      updateState({ effectiveZoom: computeEffectiveZoom() });
    },

    reload: () => {
      if (destroyed) return;

      if (sessionId && state.config.url) {
        reloadUrl().catch(() => {
          // Error already handled in state
        });
      }
    },

    destroy: () => {
      if (destroyed) return;
      destroyed = true;

      // Destroy surface
      surface?.destroy();
      surface = null;

      // Close session if we have one
      if (sessionId) {
        client.request('session.close', { sessionId }).catch(() => {});
        sessionId = null;
      }

      // Disconnect client
      client.disconnect().catch(() => {});

      listeners.clear();
    },

    getState: () => state,

    subscribe: (listener: (state: PreviewState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSurface: (): PreviewSurface | null => {
      if (!container) return null;
      ensureSurface();
      return surface?.getCanvas() ?? null;
    },

    getInspectionAccess: (): PreviewInspectionAccess => {
      // Browser backend inspection is not available in this phase
      return { status: 'pending' };
    },

    getScreenshotSource: (): ScreenshotSource | null => {
      // Screenshot frames are delivered via WebSocket, not via DOM iframe
      return null;
    },

    setZoom: (zoom: number) => {
      zoomMode = 'manual';
      manualZoom = Math.max(0.25, Math.min(4, zoom));
      updateState({
        zoomMode,
        manualZoom,
        effectiveZoom: computeEffectiveZoom(),
      });
    },

    zoomIn: () => {
      zoomMode = 'manual';
      manualZoom = Math.min(4, manualZoom + 0.25);
      updateState({
        zoomMode,
        manualZoom,
        effectiveZoom: computeEffectiveZoom(),
      });
    },

    zoomOut: () => {
      zoomMode = 'manual';
      manualZoom = Math.max(0.25, manualZoom - 0.25);
      updateState({
        zoomMode,
        manualZoom,
        effectiveZoom: computeEffectiveZoom(),
      });
    },

    setZoomMode: (mode: ZoomMode) => {
      zoomMode = mode;
      updateState({
        zoomMode,
        effectiveZoom: computeEffectiveZoom(),
      });
    },
  };

  // Expose internal methods for testing and input
  const extendedBackend = backend as PreviewBackend & {
    /** Get frame metrics for testing. */
    getFrameMetrics: () => FrameMetrics;
    /** Set the container for surface mounting. */
    setContainer: (el: HTMLDivElement | null) => void;
    /** Send pointer input to companion. */
    sendPointerInput: (
      type: string,
      x: number,
      y: number,
      button?: string,
      clickCount?: number
    ) => void;
    /** Send wheel input to companion. */
    sendWheelInput: (deltaX: number, deltaY: number) => void;
    /** Send keyboard input to companion. */
    sendKeyboardInput: (type: string, key?: string, text?: string) => void;
    /** Send touch input to companion. */
    sendTouchInput: (type: string, x: number, y: number) => void;
  };

  extendedBackend.getFrameMetrics = () => ({ ...frameMetrics });
  extendedBackend.setContainer = (el: HTMLDivElement | null) => {
    container = el;
    if (el && state.lifecycle === 'ready') {
      ensureSurface();
    }
  };

  // Input methods (Phase 2B-3)
  extendedBackend.sendPointerInput = (
    type: string,
    x: number,
    y: number,
    button?: string,
    clickCount?: number
  ) => {
    if (destroyed || !sessionId) return;

    const method =
      type === 'doubleClick'
        ? 'session.mouseDoubleClick'
        : type === 'click'
          ? 'session.mouseClick'
          : `session.mouse${type.charAt(0).toUpperCase() + type.slice(1)}`;

    client
      .request(method, {
        sessionId,
        x,
        y,
        button: button ?? 'left',
        clickCount: clickCount ?? (type === 'doubleClick' ? 2 : 1),
      })
      .catch(() => {});
  };

  extendedBackend.sendWheelInput = (deltaX: number, deltaY: number) => {
    if (destroyed || !sessionId) return;

    client
      .request('session.wheel', {
        sessionId,
        deltaX,
        deltaY,
      })
      .catch(() => {});
  };

  extendedBackend.sendKeyboardInput = (
    type: string,
    key?: string,
    text?: string
  ) => {
    if (destroyed || !sessionId) return;

    let method: string;
    let params: Record<string, unknown>;

    if (type === 'type') {
      method = 'session.type';
      params = { sessionId, text: text ?? '' };
    } else {
      method = `session.${type}`;
      params = { sessionId, key: key ?? '' };
    }

    client.request(method, params).catch(() => {});
  };

  extendedBackend.sendTouchInput = (type: string, x: number, y: number) => {
    if (destroyed || !sessionId) return;

    client
      .request(`session.touch${type.charAt(0).toUpperCase() + type.slice(1)}`, {
        sessionId,
        x,
        y,
      })
      .catch(() => {});
  };

  return extendedBackend;
}
