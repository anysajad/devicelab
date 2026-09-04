import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeviceDefinition, DeviceOrientation } from '@/devices';
import { createPreviewController } from './previewEngine';
import type { PreviewController, PreviewState } from './types';

/** Return type of the usePreview hook. */
export interface UsePreviewReturn {
  /** Current computed preview state. */
  state: PreviewState;
  /** Ref to attach to the container element that holds the iframe. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Load a new target URL and device configuration. */
  load: (url: string, device: DeviceDefinition) => void;
  /** Switch to a different device (preserves current URL). */
  setDevice: (device: DeviceDefinition) => void;
  /** Switch orientation (portrait/landscape). */
  setOrientation: (orientation: DeviceOrientation) => void;
  /** Reload the current preview URL. */
  reload: () => void;
  /** The underlying controller (for advanced use). */
  controller: PreviewController;
}

/**
 * React hook that wires a PreviewController to component lifecycle.
 *
 * Manages:
 * - Controller creation/destruction
 * - Container measurement via ResizeObserver
 * - State synchronization
 * - iframe DOM attachment
 */
export function usePreview(
  initialUrl = '',
  initialDevice: DeviceDefinition | null = null
): UsePreviewReturn {
  const controllerRef = useRef<PreviewController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Initialize controller lazily (once).
  if (controllerRef.current === null) {
    controllerRef.current = createPreviewController();
  }
  const controller = controllerRef.current;

  // React state for re-renders.
  const [state, setState] = useState<PreviewState>(() => controller.getState());

  // Subscribe to controller state changes.
  useEffect(() => {
    const unsub = controller.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, [controller]);

  // Attach iframe to container and observe resize.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const iframe = controller.getIframe();
    if (iframe && !container.contains(iframe)) {
      container.appendChild(iframe);
    }

    // Observe container size changes.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        controller.setContainerSize(width, height);
      }
    });
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      // Don't remove iframe here — controller.destroy() handles it.
    };
  }, [controller]);

  // Destroy controller on unmount.
  useEffect(() => {
    return () => {
      controller.destroy();
    };
  }, [controller]);

  // Load initial config on mount.
  useEffect(() => {
    if (initialDevice && initialUrl) {
      controller.load({
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
      controller.load({
        url,
        device,
        orientation: state.config.orientation,
      });
    },
    [controller, state.config.orientation]
  );

  const setDevice = useCallback(
    (device: DeviceDefinition) => {
      controller.load({
        url: state.config.url,
        device,
        orientation: state.config.orientation,
      });
    },
    [controller, state.config.url, state.config.orientation]
  );

  const setOrientation = useCallback(
    (orientation: DeviceOrientation) => {
      if (state.config.device) {
        controller.load({
          url: state.config.url,
          device: state.config.device,
          orientation,
        });
      }
    },
    [controller, state.config.url, state.config.device]
  );

  const reload = useCallback(() => {
    controller.reload();
  }, [controller]);

  return {
    state,
    containerRef,
    load,
    setDevice,
    setOrientation,
    reload,
    controller,
  };
}
