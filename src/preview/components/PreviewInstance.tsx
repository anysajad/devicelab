import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeviceDefinition, DeviceOrientation } from '@/devices';
import { getDeviceById } from '@/devices';
import { ZOOM_MAX, ZOOM_MIN } from '../previewUtils';
import { usePreview } from '../usePreview';
import { usePreviewStore } from '../store/usePreviewStore';
import { usePreviewInspection } from '../inspection/usePreviewInspection';
import { useScreenshot } from '../useScreenshot';
import { CUSTOM_DEVICE_ID } from '../types';
import type {
  PreviewController,
  PreviewEntry,
  PreviewInstanceId,
} from '../types';
import { PreviewFrame } from './PreviewFrame';
import { PreviewToolbar } from './PreviewToolbar';
import { DEFAULT_VIEW_TOOLS } from '../viewTools';
import type { ViewportToolsState } from '../viewTools';

interface PreviewInstanceProps {
  entry: PreviewEntry;
  sharedUrl: string;
  onRemove?: (id: string) => void;
  /** Notify the parent workspace when this instance's controller becomes available. */
  onControllerReady?: (
    id: PreviewInstanceId,
    controller: PreviewController | null
  ) => void;
}

/**
 * Determine the natural orientation of a custom viewport.
 * width > height → landscape, otherwise portrait.
 */
function resolveCustomOrientation(
  width: number,
  height: number
): DeviceOrientation {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Create a synthetic DeviceDefinition for custom viewports.
 * This object satisfies the PreviewEngine's PreviewConfig requirement
 * without duplicating Device Registry logic.
 */
function createSyntheticDevice(
  width: number,
  height: number
): DeviceDefinition {
  return {
    id: CUSTOM_DEVICE_ID,
    name: `Custom ${width} × ${height}`,
    manufacturer: 'Custom',
    category: 'custom',
    viewport: { width, height },
    devicePixelRatio: 1,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientations: ['portrait', 'landscape'],
  };
}

/**
 * A single preview instance that owns exactly one usePreview() controller.
 *
 * Invariant: ONE PreviewEntry = ONE PreviewInstance = ONE usePreview()
 * = ONE PreviewController = ONE iframe.
 *
 * Reads its entry from props (derived from the store via selector).
 * Manages controller lifecycle via usePreview().
 */
export function PreviewInstance({
  entry,
  sharedUrl,
  onRemove,
  onControllerReady,
}: PreviewInstanceProps) {
  const updateEntry = usePreviewStore((s) => s.updateEntry);
  const updateLifecycleStatus = usePreviewStore((s) => s.updateLifecycleStatus);

  const isCustomViewport = entry.viewportMode === 'custom';
  const device = isCustomViewport
    ? null
    : (getDeviceById(entry.deviceId) ?? null);

  // Resolve the effective device: real from registry or synthetic for custom.
  const effectiveDevice: DeviceDefinition | null = isCustomViewport
    ? createSyntheticDevice(
        entry.customViewportWidth ?? 375,
        entry.customViewportHeight ?? 667
      )
    : device;

  const effectiveUrl = entry.customUrl ?? sharedUrl;

  const {
    state,
    controller,
    containerRef,
    reload,
    zoomIn,
    zoomOut,
    fitToContainer,
  } = usePreview();

  // Per-instance viewport-tool toggles (local UI state — deliberately not in
  // the Zustand collection store; see viewTools for the separation rationale).
  const [tools, setTools] = useState<ViewportToolsState>(DEFAULT_VIEW_TOOLS);

  const toggleTool = useCallback((key: keyof ViewportToolsState) => {
    setTools((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const hasDevice = effectiveDevice !== null;

  // Track what we've loaded to avoid unnecessary controller.load() calls.
  const loadedConfigRef = useRef<{
    url: string;
    viewportMode: string;
    deviceId: string;
    orientation: string;
    customWidth: number | undefined;
    customHeight: number | undefined;
  } | null>(null);

  // Note: a single usePreview() call owns controller + containerRef together.
  // A previous revision called usePreview() twice, which produced a ghost
  // controller: the instance that received load() had no bound DOM container,
  // and the container-bound controller never loaded — so no iframe rendered.
  // (Found by Playwright E2E validation.)

  // Register this instance's controller with the workspace so the diagnostics
  // panel can resolve iframes for highlighting. Fires once per mount; stable
  // across re-renders (controller is created once in usePreview).
  useEffect(() => {
    onControllerReady?.(entry.id, controller);
    return () => onControllerReady?.(entry.id, null);
  }, [entry.id, controller, onControllerReady]);

  // Run inspection when the workspace toggles inspection active / rescan.
  usePreviewInspection(entry.id, controller);

  // Per-instance screenshot capture (reads controller only; non-mutating).
  const screenshot = useScreenshot(controller);

  // Load when effective configuration actually changes.
  useEffect(() => {
    if (!effectiveDevice) return;

    const viewportMode = entry.viewportMode ?? 'preset';

    // For custom viewports, resolve orientation from the dimensions themselves.
    // This ensures 1024×768 stays exactly 1024×768 regardless of any stale
    // entry.orientation value from a previous preset.
    const orientation: DeviceOrientation = isCustomViewport
      ? resolveCustomOrientation(
          entry.customViewportWidth ?? 375,
          entry.customViewportHeight ?? 667
        )
      : entry.orientation;

    const prev = loadedConfigRef.current;
    const changed =
      !prev ||
      prev.url !== effectiveUrl ||
      prev.viewportMode !== viewportMode ||
      prev.deviceId !== entry.deviceId ||
      prev.orientation !== orientation ||
      prev.customWidth !== entry.customViewportWidth ||
      prev.customHeight !== entry.customViewportHeight;

    // Safe against React StrictMode's simulated unmount/remount: the teardown
    // destroys the controller (config resets to idle), and loadedConfigRef
    // survives. Without this check the remounted instance would skip load()
    // and leave an empty frame. Only force a reload when there is a real URL
    // to load — an empty URL (about:blank) must rely on the changed() dedupe,
    // otherwise the effect re-fires and re-loads forever. (Found by Playwright
    // E2E validation.)
    const needsReload =
      effectiveUrl !== '' && controller.getState().config.url === '';

    if (changed || needsReload) {
      controller.load({
        url: effectiveUrl,
        device: effectiveDevice,
        orientation,
      });
      loadedConfigRef.current = {
        url: effectiveUrl,
        viewportMode,
        deviceId: entry.deviceId,
        orientation,
        customWidth: entry.customViewportWidth,
        customHeight: entry.customViewportHeight,
      };
    }
  }, [
    effectiveUrl,
    entry.deviceId,
    entry.orientation,
    entry.viewportMode,
    entry.customViewportWidth,
    entry.customViewportHeight,
    effectiveDevice,
    controller,
    isCustomViewport,
  ]);

  // Sync lifecycle status to the store for thumbnails.
  const prevLifecycleRef = useRef(state.lifecycle);
  useEffect(() => {
    if (prevLifecycleRef.current !== state.lifecycle) {
      prevLifecycleRef.current = state.lifecycle;
      updateLifecycleStatus(entry.id, state.lifecycle);
    }
  }, [state.lifecycle, entry.id, updateLifecycleStatus]);

  // Cleanup lifecycle status on unmount.
  // Only update if the entry still exists in the store.
  // If the entry was removed by removeEntry(), it already cleaned up
  // lifecycleStatus — we must not recreate an orphaned entry.
  useEffect(() => {
    return () => {
      const entryStillExists = usePreviewStore
        .getState()
        .entries.some((e) => e.id === entry.id);
      if (entryStillExists) {
        updateLifecycleStatus(entry.id, 'idle');
      }
    };
  }, [entry.id, updateLifecycleStatus]);

  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      if (deviceId === CUSTOM_DEVICE_ID) {
        // Switching to custom mode
        updateEntry(entry.id, {
          viewportMode: 'custom',
          deviceId: CUSTOM_DEVICE_ID,
          customViewportWidth: entry.customViewportWidth ?? 375,
          customViewportHeight: entry.customViewportHeight ?? 667,
        });
      } else {
        // Switching to a preset device
        updateEntry(entry.id, {
          viewportMode: 'preset',
          deviceId,
        });
      }
    },
    [
      entry.id,
      entry.customViewportWidth,
      entry.customViewportHeight,
      updateEntry,
    ]
  );

  const handleOrientationChange = useCallback(
    (orientation: 'portrait' | 'landscape') => {
      updateEntry(entry.id, { orientation });
    },
    [entry.id, updateEntry]
  );

  const handleCustomViewportChange = useCallback(
    (width: number, height: number) => {
      updateEntry(entry.id, {
        customViewportWidth: width,
        customViewportHeight: height,
      });
    },
    [entry.id, updateEntry]
  );

  const handleRemove = useCallback(() => {
    onRemove?.(entry.id);
  }, [entry.id, onRemove]);

  const canZoomIn = state.effectiveZoom < ZOOM_MAX;
  const canZoomOut = state.effectiveZoom > ZOOM_MIN;
  const hasLoaded = state.lifecycle !== 'idle';

  // Determine the display name for the frame label.
  const deviceName = isCustomViewport
    ? `Custom ${entry.customViewportWidth ?? 0} × ${entry.customViewportHeight ?? 0}`
    : (effectiveDevice?.name ?? 'Unknown');

  if (!hasDevice || !effectiveDevice) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PreviewToolbar
        url={effectiveUrl}
        onUrlChange={() => {
          /* URL is managed by sharedUrl or customUrl — read-only here */
        }}
        onUrlSubmit={() => {
          /* URL is managed at workspace level */
        }}
        selectedDeviceId={entry.deviceId}
        onDeviceChange={handleDeviceChange}
        orientation={entry.orientation}
        supportedOrientations={effectiveDevice.orientations}
        onOrientationChange={handleOrientationChange}
        onReload={reload}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fitToContainer}
        effectiveZoom={state.effectiveZoom}
        zoomMode={state.zoomMode}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        viewportWidth={state.viewport.width}
        viewportHeight={state.viewport.height}
        devicePixelRatio={effectiveDevice.devicePixelRatio}
        lifecycle={state.lifecycle}
        hasDevice={hasDevice}
        onRemove={onRemove ? handleRemove : undefined}
        readOnly
        isCustomViewport={isCustomViewport}
        customViewportWidth={entry.customViewportWidth}
        customViewportHeight={entry.customViewportHeight}
        onCustomViewportChange={handleCustomViewportChange}
        viewTools={tools}
        onToggleViewTool={toggleTool}
        onScreenshot={screenshot.capture}
        screenshotStatus={screenshot.status}
        screenshotBusy={screenshot.isBusy}
      />

      {/* Preview area */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-gray-100 dark:bg-gray-950">
        {/* Loading overlay */}
        {state.lifecycle === 'loading' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-950/80"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-brand-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Loading preview...
              </p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {state.lifecycle === 'error' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 dark:bg-gray-950/90"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-gray-900">
              <svg
                className="h-10 w-10 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Failed to load preview
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {state.error ??
                    'The URL may be unreachable or blocked by CORS/CSP headers.'}
                </p>
              </div>
              <button
                type="button"
                onClick={reload}
                className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Preview frame */}
        {hasLoaded && state.lifecycle !== 'error' && (
          <PreviewFrame
            containerRef={containerRef}
            viewport={state.viewport}
            effectiveZoom={state.effectiveZoom}
            devicePixelRatio={effectiveDevice.devicePixelRatio}
            safeArea={state.safeArea}
            deviceName={deviceName}
            viewportMode={isCustomViewport ? 'custom' : 'preset'}
            tools={tools}
          />
        )}
      </div>
    </div>
  );
}
