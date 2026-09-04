import { useCallback, useEffect, useRef } from 'react';

import { getDeviceById } from '@/devices';
import { ZOOM_MAX, ZOOM_MIN } from '../previewUtils';
import { usePreview } from '../usePreview';
import { usePreviewStore } from '../store/usePreviewStore';
import type { PreviewEntry } from '../types';
import { PreviewFrame } from './PreviewFrame';
import { PreviewToolbar } from './PreviewToolbar';

interface PreviewInstanceProps {
  entry: PreviewEntry;
  sharedUrl: string;
  onRemove?: (id: string) => void;
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
}: PreviewInstanceProps) {
  const updateEntry = usePreviewStore((s) => s.updateEntry);
  const updateLifecycleStatus = usePreviewStore((s) => s.updateLifecycleStatus);

  const device = getDeviceById(entry.deviceId);
  const effectiveUrl = entry.customUrl ?? sharedUrl;

  const {
    state,
    containerRef,
    controller,
    reload,
    zoomIn,
    zoomOut,
    fitToContainer,
  } = usePreview();

  const hasDevice = device !== undefined;

  // Track what we've loaded to avoid unnecessary controller.load() calls.
  const loadedConfigRef = useRef<{
    url: string;
    deviceId: string;
    orientation: string;
  } | null>(null);

  // Load when effective URL, device, or orientation actually changes.
  useEffect(() => {
    if (!device) return;

    const prev = loadedConfigRef.current;
    const changed =
      !prev ||
      prev.url !== effectiveUrl ||
      prev.deviceId !== entry.deviceId ||
      prev.orientation !== entry.orientation;

    if (changed) {
      controller.load({
        url: effectiveUrl,
        device,
        orientation: entry.orientation,
      });
      loadedConfigRef.current = {
        url: effectiveUrl,
        deviceId: entry.deviceId,
        orientation: entry.orientation,
      };
    }
  }, [effectiveUrl, entry.deviceId, entry.orientation, device, controller]);

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
      updateEntry(entry.id, { deviceId });
    },
    [entry.id, updateEntry]
  );

  const handleOrientationChange = useCallback(
    (orientation: 'portrait' | 'landscape') => {
      updateEntry(entry.id, { orientation });
    },
    [entry.id, updateEntry]
  );

  const handleRemove = useCallback(() => {
    onRemove?.(entry.id);
  }, [entry.id, onRemove]);

  const canZoomIn = state.effectiveZoom < ZOOM_MAX;
  const canZoomOut = state.effectiveZoom > ZOOM_MIN;
  const hasLoaded = state.lifecycle !== 'idle';

  if (!hasDevice) return null;

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
        supportedOrientations={device.orientations}
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
        devicePixelRatio={device.devicePixelRatio}
        lifecycle={state.lifecycle}
        hasDevice={hasDevice}
        onRemove={onRemove ? handleRemove : undefined}
        readOnly
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
            safeArea={state.safeArea}
            deviceName={device.name}
          />
        )}
      </div>
    </div>
  );
}
