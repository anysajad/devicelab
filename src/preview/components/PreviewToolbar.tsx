import { getDevicesByCategory } from '@/devices';
import type {
  DeviceCategory,
  DeviceDefinition,
  DeviceOrientation,
} from '@/devices';
import type { PreviewLifecycle, ZoomMode } from '../types';

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
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: 'Phones',
  tablet: 'Tablets',
  desktop: 'Desktops',
  custom: 'Custom',
};

const CATEGORY_ORDER: DeviceCategory[] = ['phone', 'tablet', 'desktop'];

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
}: PreviewToolbarProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    devices: getDevicesByCategory(cat),
  })).filter((g) => g.devices.length > 0);

  const portraitEnabled = supportedOrientations.includes('portrait');
  const landscapeEnabled = supportedOrientations.includes('landscape');

  const zoomPercent = Math.round(effectiveZoom * 100);
  const isFitMode = zoomMode === 'fit';

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      onUrlSubmit();
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
        placeholder="Enter URL to preview..."
        className="min-w-[200px] flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        aria-label="Target URL"
      />

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Device selector */}
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
      </select>

      {/* Orientation toggle */}
      <div
        className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700"
        role="group"
        aria-label="Orientation"
      >
        <button
          type="button"
          onClick={() => onOrientationChange('portrait')}
          disabled={!portraitEnabled || !hasDevice}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            orientation === 'portrait' && hasDevice
              ? 'bg-brand-500 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } ${
            !portraitEnabled || !hasDevice
              ? 'cursor-not-allowed opacity-50'
              : ''
          }`}
          aria-label="Portrait orientation"
          aria-pressed={orientation === 'portrait'}
        >
          P
        </button>
        <button
          type="button"
          onClick={() => onOrientationChange('landscape')}
          disabled={!landscapeEnabled || !hasDevice}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            orientation === 'landscape' && hasDevice
              ? 'bg-brand-500 text-white'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } ${
            !landscapeEnabled || !hasDevice
              ? 'cursor-not-allowed opacity-50'
              : ''
          }`}
          aria-label="Landscape orientation"
          aria-pressed={orientation === 'landscape'}
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
    </nav>
  );
}
