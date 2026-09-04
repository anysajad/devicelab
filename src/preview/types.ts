import type {
  DeviceDefinition,
  DeviceOrientation,
  SafeAreaInsets,
} from '@/devices';

/** Lifecycle state of the preview iframe. */
export type PreviewLifecycle = 'idle' | 'loading' | 'ready' | 'error';

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
  readonly zoom: number;
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
}
