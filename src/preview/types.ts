import type {
  DeviceDefinition,
  DeviceOrientation,
  SafeAreaInsets,
} from '@/devices';

export type { DeviceOrientation } from '@/devices';

/** Lifecycle state of the preview iframe. */
export type PreviewLifecycle = 'idle' | 'loading' | 'ready' | 'error';

/** Zoom mode: 'fit' = auto-fit to container, 'manual' = user-specified. */
export type ZoomMode = 'fit' | 'manual';

/** Configuration provided to initialize or update a preview. */
export interface PreviewConfig {
  readonly url: string;
  readonly device: DeviceDefinition;
  readonly orientation: DeviceOrientation;
}

/** Computed viewport for the current device + orientation. */
export interface ComputedViewport {
  readonly width: number;
  readonly height: number;
}

/** Complete computed state derived from config + container size. */
export interface PreviewState {
  readonly config: PreviewConfig;
  readonly viewport: ComputedViewport;
  /** Auto-fit zoom computed from container and viewport dimensions. */
  readonly zoom: number;
  /** Current zoom mode: 'fit' or 'manual'. */
  readonly zoomMode: ZoomMode;
  /** User-specified zoom level (only meaningful when zoomMode is 'manual'). */
  readonly manualZoom: number;
  /** The zoom value actually applied to the iframe transform. */
  readonly effectiveZoom: number;
  readonly safeArea: SafeAreaInsets;
  readonly lifecycle: PreviewLifecycle;
  readonly error: string | null;
}

/** Imperative controller returned by createPreviewController. */
export interface PreviewController {
  /** Load a new configuration into the preview. */
  load(config: PreviewConfig): void;
  /** Update the host container dimensions (triggers zoom recalculation). */
  setContainerSize(width: number, height: number): void;
  /** Reload the current preview URL. */
  reload(): void;
  /** Destroy the iframe and clean up all listeners. */
  destroy(): void;
  /** Get the current computed state snapshot. */
  getState(): PreviewState;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: PreviewState) => void): () => void;
  /** Get the underlying iframe element (or null if destroyed). */
  getIframe(): HTMLIFrameElement | null;
  /** Set an explicit zoom level. Switches to manual mode. */
  setZoom(zoom: number): void;
  /** Zoom in by one step. Switches to manual mode. */
  zoomIn(): void;
  /** Zoom out by one step. Switches to manual mode. */
  zoomOut(): void;
  /** Switch between 'fit' and 'manual' zoom modes. */
  setZoomMode(mode: ZoomMode): void;
}

// --- Multi-device workspace types ---

/** Unique identifier for a preview instance. */
export type PreviewInstanceId = string;

/** Layout mode for the multi-device workspace. */
export type LayoutMode = 'grid' | 'focus';

/** A single preview entry in the workspace collection. */
export interface PreviewEntry {
  readonly id: PreviewInstanceId;
  readonly deviceId: string;
  readonly orientation: DeviceOrientation;
  /** If set, overrides the workspace shared URL for this preview. */
  readonly customUrl?: string;
}
