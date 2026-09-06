/**
 * Browser preview backend — Phase 2B-1 of the Playwright companion integration.
 *
 * This backend communicates with a local companion process over WebSocket
 * to control a real Chromium browser instance. It implements the abstract
 * `PreviewBackend` contract, allowing the existing PreviewInstance/usePreview
 * to operate without knowing the backend is Playwright-based.
 *
 * This phase establishes the control plane only:
 * - Session lifecycle
 * - URL navigation
 * - Viewport configuration
 * - State reporting
 *
 * The data plane (screenshot frames, canvas rendering) is deferred to Phase 2B-2.
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
import {
  createCompanionClient,
} from './browserCompanionClient';
import type { ClientEvent } from './browserCompanionClient';

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
 *
 * Companion states:
 *   idle → starting → ready → loading → error → closed
 *
 * Preview states:
 *   idle → loading → ready → error
 *
 * Mapping:
 *   idle → idle
 *   starting → loading (browser is starting)
 *   ready → ready (page loaded)
 *   loading → loading (navigation in progress)
 *   error → error (something went wrong)
 *   closed → error (session was closed unexpectedly)
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
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a browser preview backend that communicates with a local companion.
 *
 * This backend:
 * - Connects to the companion via WebSocket
 * - Creates a browser session with the requested viewport
 * - Loads URLs via Playwright
 * - Reports state back to the preview layer
 *
 * This phase does NOT:
 * - Stream screenshot frames
 * - Render canvas content
 * - Forward mouse/keyboard input
 * - Support DPR emulation
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

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  function computeEffectiveZoom(): number {
    if (zoomMode === 'manual') {
      return manualZoom;
    }
    // Fit mode: scale to fit container
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
    }
  }

  client.on(handleClientEvent);

  // ---------------------------------------------------------------------------
  // PreviewBackend implementation
  // ---------------------------------------------------------------------------

  async function initializeSession(
    viewport: ComputedViewport
  ): Promise<void> {
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

      // Close session if we have one
      if (sessionId) {
        client
          .request('session.close', { sessionId })
          .catch(() => {});
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
      // Phase 2B-1: No visual surface yet
      // This will be a canvas element in Phase 2B-2
      return null;
    },

    getInspectionAccess: (): PreviewInspectionAccess => {
      // Browser backend inspection is not available in this phase
      return { status: 'pending' };
    },

    getScreenshotSource: (): ScreenshotSource | null => {
      // Screenshot frames are not delivered in this phase
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

  return backend;
}
