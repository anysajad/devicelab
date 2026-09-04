import { useCallback, useRef, useState } from 'react';

import { getDeviceById } from '@/devices';
import { ZOOM_MAX, ZOOM_MIN } from '../previewUtils';
import { usePreview } from '../usePreview';
import { PreviewFrame } from './PreviewFrame';
import { PreviewToolbar } from './PreviewToolbar';

const DEFAULT_DEVICE_ID = 'iphone-15';

export function PreviewWorkspace() {
  const {
    state,
    containerRef,
    load,
    setDevice,
    setOrientation,
    reload,
    zoomIn,
    zoomOut,
    fitToContainer,
  } = usePreview();

  const [url, setUrl] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState(DEFAULT_DEVICE_ID);
  const previewAreaRef = useRef<HTMLDivElement>(null);

  const device = getDeviceById(selectedDeviceId);
  const hasDevice = device !== undefined;

  const handleSubmitUrl = useCallback(() => {
    if (!device || url.trim().length === 0) return;
    load(url, device);
  }, [device, url, load]);

  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      const newDevice = getDeviceById(deviceId);
      if (newDevice && state.config.url) {
        setDevice(newDevice);
      }
    },
    [state.config.url, setDevice]
  );

  const handleOrientationChange = useCallback(
    (orientation: 'portrait' | 'landscape') => {
      setOrientation(orientation);
    },
    [setOrientation]
  );

  const handleFit = useCallback(() => {
    fitToContainer();
    // Also scroll to top-left for a clean view
    const area = previewAreaRef.current;
    if (area) {
      area.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [fitToContainer]);

  const canZoomIn = state.effectiveZoom < ZOOM_MAX;
  const canZoomOut = state.effectiveZoom > ZOOM_MIN;
  const hasLoaded = state.lifecycle !== 'idle';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PreviewToolbar
        url={url}
        onUrlChange={setUrl}
        onUrlSubmit={handleSubmitUrl}
        selectedDeviceId={selectedDeviceId}
        onDeviceChange={handleDeviceChange}
        orientation={state.config.orientation}
        supportedOrientations={device?.orientations ?? []}
        onOrientationChange={handleOrientationChange}
        onReload={reload}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={handleFit}
        effectiveZoom={state.effectiveZoom}
        zoomMode={state.zoomMode}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        viewportWidth={state.viewport.width}
        viewportHeight={state.viewport.height}
        devicePixelRatio={device?.devicePixelRatio ?? 0}
        lifecycle={state.lifecycle}
        hasDevice={hasDevice}
      />

      {/* Preview area — scroll container */}
      <div
        ref={previewAreaRef}
        className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 dark:bg-gray-950"
      >
        {/* Inner wrapper — centers content when smaller, allows scroll when larger */}
        <div className="flex min-w-full min-h-full items-center justify-center p-4">
          {/* Idle state — guidance */}
          {!hasLoaded && (
            <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
              <svg
                className="h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">
                Enter a URL above and select a device to start previewing
              </p>
            </div>
          )}

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

          {/* Preview frame — shown when a device is selected and URL is loaded */}
          {hasDevice && hasLoaded && state.lifecycle !== 'error' && (
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
    </div>
  );
}
