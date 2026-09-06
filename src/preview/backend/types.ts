import type { InspectionInaccessibleReason } from '@/inspection';
import type { ScreenshotSource } from '@/screenshot';
import type { PreviewConfig, PreviewState, ZoomMode } from '../types';

/**
 * Identifier for the rendering strategy a backend uses.
 *
 * The iframe backend renders the target document inside a sandboxed
 * <iframe>. The browser backend renders via a local Playwright companion.
 * UI components must treat `kind` as an opaque provider label — they must
 * never branch on it to reach into a concrete implementation.
 */
export type PreviewBackendKind = 'iframe' | 'browser';

/**
 * The renderable node a backend exposes for mounting into the frame.
 *
 * Chosen as the minimal surface type the UI needs: the workspace appends it
 * into a scaled container and otherwise writes nothing to it. The iframe
 * backend returns an HTMLIFrameElement; a future canvas/screencast backend
 * could return a different element type without changing this contract.
 */
export type PreviewSurface = HTMLElement;

/**
 * Backend capability: whether the currently rendered page can be inspected.
 *
 * Consumers must never assume a live same-origin iframe exists. The iframe
 * backend derives this from iframe.contentDocument access; a future browser
 * backend may expose a remote inspection handle instead. Never fabricate
 * access to a cross-origin page.
 */
export type PreviewInspectionAccess =
  | { readonly status: 'pending' }
  | {
      readonly status: 'inaccessible';
      readonly reason: InspectionInaccessibleReason;
    }
  | { readonly status: 'available'; readonly document: Document };

/**
 * Backend-neutral contract for a single preview instance.
 *
 * A backend owns one rendered preview (lifecycle, viewport, zoom, surface)
 * and exposes only the capabilities the UI relies on. Deliberately no
 * Playwright/CDP/WebSocket/iframe specifics: consumers use `getSurface()`,
 * `getInspectionAccess()` and `getScreenshotSource()` and never reach into a
 * concrete implementation.
 */
export interface PreviewBackend {
  /** Label identifying the rendering strategy. UI must not branch on it. */
  readonly kind: PreviewBackendKind;

  /** Load a new target URL + device configuration. */
  load(config: PreviewConfig): void;
  /** Update the host container dimensions (triggers zoom recalculation). */
  setContainerSize(width: number, height: number): void;
  /** Reload the current configuration. */
  reload(): void;
  /** Destroy the surface and clean up all listeners. */
  destroy(): void;
  /** Snapshot of the current computed state. */
  getState(): PreviewState;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: PreviewState) => void): () => void;

  /** Mountable node for this preview, or null before load / after destroy. */
  getSurface(): PreviewSurface | null;
  /** Whether the currently rendered page can be inspected. */
  getInspectionAccess(): PreviewInspectionAccess;
  /** Source for the screenshot subsystem, or null when not capturable this way. */
  getScreenshotSource(): ScreenshotSource | null;

  /** Set an explicit zoom level. Switches to manual mode. */
  setZoom(zoom: number): void;
  /** Zoom in by one step. Switches to manual mode. */
  zoomIn(): void;
  /** Zoom out by one step. Switches to manual mode. */
  zoomOut(): void;
  /** Switch between 'fit' and 'manual' zoom modes. */
  setZoomMode(mode: ZoomMode): void;
}
