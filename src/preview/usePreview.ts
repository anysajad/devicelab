import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeviceDefinition, DeviceOrientation } from '@/devices';
import { createIframePreviewBackend } from './backend';
import type { PreviewBackend } from './backend';
import type { PreviewState } from './types';

/** Return type of the usePreview hook. */
export interface UsePreviewReturn {
  /** Current computed preview state. */
  state: PreviewState;
  /** Ref to attach to the container element that holds the preview surface. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Load a new target URL and device configuration. */
  load: (url: string, device: DeviceDefinition) => void;
  /** Switch to a different device (preserves current URL). */
  setDevice: (device: DeviceDefinition) => void;
  /** Switch orientation (portrait/landscape). */
  setOrientation: (orientation: DeviceOrientation) => void;
  /** Reload the current preview URL. */
  reload: () => void;
  /** The backend-neutral preview backend driving this instance. */
  backend: PreviewBackend;
  /** Set an explicit zoom level. Switches to manual mode. */
  setZoom: (zoom: number) => void;
  /** Zoom in by one step. Switches to manual mode. */
  zoomIn: () => void;
  /** Zoom out by one step. Switches to manual mode. */
  zoomOut: () => void;
  /** Switch to fit mode (auto-fit to container). */
  fitToContainer: () => void;
}

/**
 * React hook that wires a PreviewBackend to component lifecycle.
 *
 * Manages:
 * - Backend creation/destruction
 * - Container measurement via ResizeObserver
 * - State synchronization
 * - Preview surface DOM attachment
 *
 * The hook is backend-agnostic: it talks only through the abstract
 * `PreviewBackend` contract (state, subscribe, surface) and never references
 * iframes, so a future browser-backed backend can be substituted here.
 */
export function usePreview(
  initialUrl = '',
  initialDevice: DeviceDefinition | null = null
): UsePreviewReturn {
  const backendRef = useRef<PreviewBackend | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Initialize backend lazily (once).
  if (backendRef.current === null) {
    backendRef.current = createIframePreviewBackend();
  }
  const backend = backendRef.current;

  // React state for re-renders.
  const [state, setState] = useState<PreviewState>(() => backend.getState());

  // Subscribe to backend state changes.
  useEffect(() => {
    const unsub = backend.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, [backend]);

  // Attach the preview surface to the container and observe resize.
  // The surface only exists after load() creates it, so key the effect on the
  // surface instance itself (null before load, a stable DOM node after): the
  // mount-time run must not skip the append once load() has run.
  const surface = backend.getSurface();
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (surface && !container.contains(surface)) {
      container.appendChild(surface);
    }

    // Observe container size changes.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        backend.setContainerSize(width, height);
      }
    });
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      // Don't remove surface here — backend.destroy() handles it.
    };
  }, [backend, surface]);

  // Destroy backend on unmount.
  useEffect(() => {
    return () => {
      backend.destroy();
    };
  }, [backend]);

  // Load initial config on mount.
  useEffect(() => {
    if (initialDevice && initialUrl) {
      backend.load({
        url: initialUrl,
        device: initialDevice,
        orientation: 'portrait',
      });
    }
    // Only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    (url: string, device: DeviceDefinition) => {
      backend.load({
        url,
        device,
        orientation: state.config.orientation,
      });
    },
    [backend, state.config.orientation]
  );

  const setDevice = useCallback(
    (device: DeviceDefinition) => {
      backend.load({
        url: state.config.url,
        device,
        orientation: state.config.orientation,
      });
    },
    [backend, state.config.url, state.config.orientation]
  );

  const setOrientation = useCallback(
    (orientation: DeviceOrientation) => {
      if (state.config.device) {
        backend.load({
          url: state.config.url,
          device: state.config.device,
          orientation,
        });
      }
    },
    [backend, state.config.url, state.config.device]
  );

  const reload = useCallback(() => {
    backend.reload();
  }, [backend]);

  const setZoom = useCallback(
    (zoom: number) => {
      backend.setZoom(zoom);
    },
    [backend]
  );

  const zoomIn = useCallback(() => {
    backend.zoomIn();
  }, [backend]);

  const zoomOut = useCallback(() => {
    backend.zoomOut();
  }, [backend]);

  const fitToContainer = useCallback(() => {
    backend.setZoomMode('fit');
  }, [backend]);

  return {
    state,
    containerRef,
    load,
    setDevice,
    setOrientation,
    reload,
    backend,
    setZoom,
    zoomIn,
    zoomOut,
    fitToContainer,
  };
}
