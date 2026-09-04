import { useCallback, useEffect, useState } from 'react';

import { getDevicesByCategory } from '@/devices';
import type {
  DeviceCategory,
  DeviceDefinition,
  DeviceOrientation,
} from '@/devices';
import {
  CUSTOM_VIEWPORT_MAX,
  CUSTOM_VIEWPORT_MIN,
  parseCustomViewport,
} from '../previewUtils';
import { CUSTOM_DEVICE_ID } from '../types';
import type { PreviewLifecycle, ZoomMode } from '../types';
import type { ViewportToolsState } from '../viewTools';
import type { ScreenshotStatus } from '../../screenshot';
import { ScreenshotButton } from './ScreenshotButton';

interface PreviewToolbarProps {
  url: string;
  onUrlChange: (url: string) => void;
  onUrlSubmit: () => void;
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  orientation: DeviceOrientation;
  supportedOrientations: readonly DeviceOrientation[];
  onOrientationChange: (orientation: DeviceOrientation) => void;
  onReload: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  effectiveZoom: number;
  zoomMode: ZoomMode;
  canZoomIn: boolean;
  canZoomOut: boolean;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  lifecycle: PreviewLifecycle;
  hasDevice: boolean;
  /** Optional remove button handler. When provided, a close button is shown. */
  onRemove?: () => void;
  /** When true, the URL input is read-only (informational display). */
  readOnly?: boolean;
  /** When true, the preview uses custom viewport dimensions. */
  isCustomViewport?: boolean;
  /** Custom viewport width (only used when isCustomViewport is true). */
  customViewportWidth?: number;
  /** Custom viewport height (only used when isCustomViewport is true). */
  customViewportHeight?: number;
  /** Called when custom viewport dimensions are committed. */
  onCustomViewportChange?: (width: number, height: number) => void;
  /** Current per-instance viewport-tool toggle state. */
  viewTools?: ViewportToolsState;
  /** Called when a viewport tool is toggled. */
  onToggleViewTool?: (key: keyof ViewportToolsState) => void;
  /** Called when the user requests a screenshot of this preview. */
  onScreenshot?: () => void;
  /** Latest screenshot status, surfaced for honesty about unsupported cases. */
  screenshotStatus?: ScreenshotStatus | null;
  /** True while a screenshot capture is in flight. */
  screenshotBusy?: boolean;
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: 'Phones',
  tablet: 'Tablets',
  desktop: 'Desktops',
  custom: 'Custom',
};

const CATEGORY_ORDER: DeviceCategory[] = ['phone', 'tablet', 'desktop'];

interface ViewToolButton {
  key: keyof ViewportToolsState;
  name: string;
  label: string;
  title: string;
  icon: React.ReactNode;
}

const VIEW_TOOL_BUTTONS: ViewToolButton[] = [
  {
    key: 'rulers',
    name: 'Rulers',
    label: 'Toggle rulers',
    title: 'Show CSS-pixel rulers around the viewport',
    icon: (
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    ),
  },
  {
    key: 'grid',
    name: 'Grid',
    label: 'Toggle grid overlay',
    title: 'Show a viewport-only grid overlay',
    icon: (
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8h18M3 12h18M3 16h18M8 3v18M12 3v18M16 3v18"
        />
      </svg>
    ),
  },
  {
    key: 'safeArea',
    name: 'Safe',
    label: 'Toggle safe-area',
    title: 'Show safe-area boundaries',
    icon: (
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 8h16M4 16h16M8 4v16M16 4v16"
        />
      </svg>
    ),
  },
  {
    key: 'info',
    name: 'Info',
    label: 'Toggle viewport info',
    title: 'Show the viewport information readout',
    icon: (
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
];

function getStatusColor(lifecycle: PreviewLifecycle): string {
  switch (lifecycle) {
    case 'loading':
      return 'bg-amber-400';
    case 'ready':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

function getStatusLabel(lifecycle: PreviewLifecycle): string {
  switch (lifecycle) {
    case 'loading':
      return 'Loading';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

export function PreviewToolbar({
  url,
  onUrlChange,
  onUrlSubmit,
  selectedDeviceId,
  onDeviceChange,
  orientation,
  supportedOrientations,
  onOrientationChange,
  onReload,
  onZoomIn,
  onZoomOut,
  onFit,
  effectiveZoom,
  zoomMode,
  canZoomIn,
  canZoomOut,
  viewportWidth,
  viewportHeight,
  devicePixelRatio,
  lifecycle,
  hasDevice,
  onRemove,
  readOnly,
  isCustomViewport = false,
  customViewportWidth,
  customViewportHeight,
  onCustomViewportChange,
  viewTools,
  onToggleViewTool,
  onScreenshot,
  screenshotStatus,
  screenshotBusy,
}: PreviewToolbarProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    devices: getDevicesByCategory(cat),
  })).filter((g) => g.devices.length > 0);

  // Local draft state for custom viewport dimensions.
  // Committed to store on blur/Enter via onCustomViewportChange.
  const [draftWidth, setDraftWidth] = useState(
    () => customViewportWidth?.toString() ?? ''
  );
  const [draftHeight, setDraftHeight] = useState(
    () => customViewportHeight?.toString() ?? ''
  );

  // Sync draft state when entry changes externally (e.g., preset → custom switch).
  useEffect(() => {
    setDraftWidth(customViewportWidth?.toString() ?? '');
    setDraftHeight(customViewportHeight?.toString() ?? '');
  }, [customViewportWidth, customViewportHeight]);

  const commitCustomViewport = useCallback(() => {
    if (!onCustomViewportChange) return;
    const w = parseCustomViewport(draftWidth);
    const h = parseCustomViewport(draftHeight);
    // Only commit if both are valid. Invalid input preserves the last valid stored value.
    if (w !== null && h !== null) {
      onCustomViewportChange(w, h);
    }
  }, [draftWidth, draftHeight, onCustomViewportChange]);

  const portraitEnabled =
    !isCustomViewport && supportedOrientations.includes('portrait');
  const landscapeEnabled =
    !isCustomViewport && supportedOrientations.includes('landscape');

  const zoomPercent = Math.round(effectiveZoom * 100);
  const isFitMode = zoomMode === 'fit';

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      onUrlSubmit();
    }
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitCustomViewport();
    }
  }

  return (
    <nav
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
      aria-label="Preview controls"
    >
      {/* URL input */}
      <input
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onUrlSubmit}
        readOnly={readOnly}
        placeholder={readOnly ? undefined : 'Enter URL to preview...'}
        className={`min-w-[200px] flex-1 rounded-md border px-3 py-1.5 text-sm ${
          readOnly
            ? 'cursor-default border-gray-200 bg-gray-50/50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400'
            : 'border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500'
        }`}
        aria-label={readOnly ? 'Preview URL (read-only)' : 'Target URL'}
        aria-readonly={readOnly || undefined}
      />

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Device selector with Custom option */}
      <select
        value={selectedDeviceId}
        onChange={(e) => onDeviceChange(e.target.value)}
        className="w-48 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        aria-label="Select device"
      >
        <option value="">Select device...</option>
        {grouped.map((group) => (
          <optgroup key={group.category} label={group.label}>
            {group.devices.map((d: DeviceDefinition) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.viewport.width} × {d.viewport.height}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM_DEVICE_ID}>Custom viewport...</option>
      </select>

      {/* Custom viewport width/height inputs */}
      {isCustomViewport && (
        <>
          <div className="flex items-center gap-1">
            <label
              htmlFor="custom-viewport-width"
              className="text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              W:
            </label>
            <input
              id="custom-viewport-width"
              type="text"
              inputMode="numeric"
              value={draftWidth}
              onChange={(e) => setDraftWidth(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              onBlur={commitCustomViewport}
              placeholder={`${CUSTOM_VIEWPORT_MIN}–${CUSTOM_VIEWPORT_MAX}`}
              className="w-20 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs tabular-nums text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              aria-label="Custom viewport width"
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">×</span>
            <label
              htmlFor="custom-viewport-height"
              className="text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              H:
            </label>
            <input
              id="custom-viewport-height"
              type="text"
              inputMode="numeric"
              value={draftHeight}
              onChange={(e) => setDraftHeight(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              onBlur={commitCustomViewport}
              placeholder={`${CUSTOM_VIEWPORT_MIN}–${CUSTOM_VIEWPORT_MAX}`}
              className="w-20 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs tabular-nums text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              aria-label="Custom viewport height"
            />
          </div>
        </>
      )}

      {/* Orientation toggle */}
      <div
        className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700"
        role="group"
        aria-label={
          isCustomViewport
            ? 'Orientation (not applicable for custom viewports)'
            : 'Orientation'
        }
      >
        <button
          type="button"
          onClick={() => onOrientationChange('portrait')}
          disabled={!portraitEnabled || !hasDevice}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            orientation === 'portrait' && hasDevice && !isCustomViewport
              ? 'bg-brand-500 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } ${
            !portraitEnabled || !hasDevice || isCustomViewport
              ? 'cursor-not-allowed opacity-50'
              : ''
          }`}
          aria-label="Portrait orientation"
          aria-pressed={orientation === 'portrait' && !isCustomViewport}
          title={
            isCustomViewport
              ? 'Orientation is not applicable for custom viewports'
              : undefined
          }
        >
          P
        </button>
        <button
          type="button"
          onClick={() => onOrientationChange('landscape')}
          disabled={!landscapeEnabled || !hasDevice}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            orientation === 'landscape' && hasDevice && !isCustomViewport
              ? 'bg-brand-500 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } ${
            !landscapeEnabled || !hasDevice || isCustomViewport
              ? 'cursor-not-allowed opacity-50'
              : ''
          }`}
          aria-label="Landscape orientation"
          aria-pressed={orientation === 'landscape' && !isCustomViewport}
          title={
            isCustomViewport
              ? 'Orientation is not applicable for custom viewports'
              : undefined
          }
        >
          L
        </button>
      </div>

      {/* Reload */}
      <button
        type="button"
        onClick={onReload}
        disabled={!hasDevice}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        aria-label="Reload preview"
      >
        <svg
          className={`h-4 w-4 ${lifecycle === 'loading' ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      {/* Screenshot */}
      {onScreenshot && (
        <ScreenshotButton
          hasDevice={hasDevice}
          isBusy={screenshotBusy ?? false}
          status={screenshotStatus ?? null}
          onCapture={onScreenshot}
        />
      )}

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={!hasDevice || !canZoomOut}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="min-w-[3ch] text-center text-xs font-medium text-gray-600 tabular-nums dark:text-gray-400">
          {hasDevice ? `${zoomPercent}%` : '—'}
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={!hasDevice || !canZoomIn}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={onFit}
          disabled={!hasDevice}
          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isFitMode && hasDevice
              ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300'
              : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
          aria-label="Fit preview to container"
          aria-pressed={isFitMode}
        >
          Fit
        </button>
      </div>

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Viewport tools (rulers / grid / safe-area / info) */}
      {hasDevice && onToggleViewTool && viewTools && (
        <div
          className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700"
          role="group"
          aria-label="Viewport tools"
        >
          {VIEW_TOOL_BUTTONS.map((tool) => {
            const active = viewTools[tool.key];
            return (
              <button
                key={tool.key}
                type="button"
                onClick={() => onToggleViewTool(tool.key)}
                aria-label={tool.label}
                aria-pressed={active}
                title={tool.title}
                className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {tool.icon}
                {tool.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Viewport info */}
      {hasDevice && (
        <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {viewportWidth} × {viewportHeight} · {devicePixelRatio}×
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Lifecycle status */}
      <div
        className="flex items-center gap-1.5"
        role="status"
        aria-live="polite"
        aria-label={`Preview status: ${getStatusLabel(lifecycle)}`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${getStatusColor(lifecycle)} ${lifecycle === 'loading' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {getStatusLabel(lifecycle)}
        </span>
      </div>

      {/* Remove button (only when onRemove is provided) */}
      {onRemove && (
        <>
          <div
            className="h-5 w-px bg-gray-200 dark:bg-gray-700"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-700 transition-colors hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-red-950 dark:hover:text-red-400"
            aria-label="Remove preview"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </>
      )}
    </nav>
  );
}
