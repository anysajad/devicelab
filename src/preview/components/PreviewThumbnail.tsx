import { getDeviceById } from '@/devices';
import { CUSTOM_DEVICE_ID } from '../types';
import type { PreviewEntry, PreviewLifecycle } from '../types';

interface PreviewThumbnailProps {
  entry: PreviewEntry;
  isActive: boolean;
  lifecycle: PreviewLifecycle;
  onClick: () => void;
}

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

/**
 * Metadata-only thumbnail for focus mode.
 *
 * This component MUST NOT create iframes, controllers, or call usePreview().
 * It displays device identification information and lifecycle status.
 * Handles both preset devices and custom viewport entries.
 */
export function PreviewThumbnail({
  entry,
  isActive,
  lifecycle,
  onClick,
}: PreviewThumbnailProps) {
  const isCustom =
    entry.viewportMode === 'custom' || entry.deviceId === CUSTOM_DEVICE_ID;
  const device = isCustom ? null : getDeviceById(entry.deviceId);

  const displayName = isCustom
    ? `Custom ${entry.customViewportWidth ?? 0} × ${entry.customViewportHeight ?? 0}`
    : (device?.name ?? 'Unknown');

  const displayWidth = isCustom
    ? (entry.customViewportWidth ?? 0)
    : (device?.viewport.width ?? 0);

  const displayHeight = isCustom
    ? (entry.customViewportHeight ?? 0)
    : (device?.viewport.height ?? 0);

  // For custom viewports, determine orientation from dimensions.
  const displayOrientation = isCustom
    ? displayWidth > displayHeight
      ? 'L'
      : 'P'
    : entry.orientation === 'portrait'
      ? 'P'
      : 'L';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 text-xs transition-colors ${
        isActive
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
      }`}
      aria-label={`${displayName} preview${isActive ? ' (active)' : ''}`}
      aria-pressed={isActive}
    >
      <span className="font-medium text-gray-900 dark:text-gray-100">
        {displayName}
      </span>
      <span className="text-gray-500 dark:text-gray-400">
        {displayWidth} × {displayHeight}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {displayOrientation}
        </span>
        <span
          className={`inline-block h-2 w-2 rounded-full ${getStatusColor(lifecycle)}`}
          aria-hidden="true"
        />
        <span className="sr-only">{getStatusLabel(lifecycle)}</span>
      </div>
    </button>
  );
}
