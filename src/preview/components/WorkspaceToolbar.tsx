import { useCallback, useEffect, useState } from 'react';

import { getDevicesByCategory } from '@/devices';
import type { DeviceCategory, DeviceDefinition } from '@/devices';
import { usePreviewStore } from '../store/usePreviewStore';

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: 'Phones',
  tablet: 'Tablets',
  desktop: 'Desktops',
  custom: 'Custom',
};

const CATEGORY_ORDER: DeviceCategory[] = ['phone', 'tablet', 'desktop'];

interface WorkspaceToolbarProps {
  /** Whether the workspace has any entries (for UI state). */
  hasEntries: boolean;
}

export function WorkspaceToolbar({ hasEntries }: WorkspaceToolbarProps) {
  const sharedUrl = usePreviewStore((s) => s.sharedUrl);
  const setSharedUrl = usePreviewStore((s) => s.setSharedUrl);
  const layoutMode = usePreviewStore((s) => s.layoutMode);
  const setLayoutMode = usePreviewStore((s) => s.setLayoutMode);
  const addEntry = usePreviewStore((s) => s.addEntry);

  const [urlInput, setUrlInput] = useState(sharedUrl);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    devices: getDevicesByCategory(cat),
  })).filter((g) => g.devices.length > 0);

  // Sync local URL input state when sharedUrl changes externally (e.g., from store reset).
  useEffect(() => {
    setUrlInput(sharedUrl);
  }, [sharedUrl]);

  const handleSubmitUrl = useCallback(() => {
    setSharedUrl(urlInput);
  }, [urlInput, setSharedUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSubmitUrl();
      }
    },
    [handleSubmitUrl]
  );

  const handleAddDevice = useCallback(
    (deviceId: string) => {
      addEntry(deviceId);
      setShowAddMenu(false);
    },
    [addEntry]
  );

  return (
    <nav
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
      aria-label="Workspace controls"
    >
      {/* Shared URL input */}
      <input
        type="url"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmitUrl}
        placeholder="Enter URL to preview across devices..."
        className="min-w-[200px] flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        aria-label="Shared preview URL"
      />

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Add Device */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Add device"
          aria-expanded={showAddMenu}
          aria-haspopup="true"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Device
        </button>

        {showAddMenu && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {grouped.map((group) => (
              <div key={group.category}>
                <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  {group.label}
                </div>
                {group.devices.map((d: DeviceDefinition) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleAddDevice(d.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {d.viewport.width} × {d.viewport.height}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout mode toggle */}
      {hasEntries && (
        <div
          className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700"
          role="group"
          aria-label="Layout mode"
        >
          <button
            type="button"
            onClick={() => setLayoutMode('grid')}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layoutMode === 'grid'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            aria-label="Grid layout"
            aria-pressed={layoutMode === 'grid'}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('focus')}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layoutMode === 'focus'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            aria-label="Focus layout"
            aria-pressed={layoutMode === 'focus'}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </div>
      )}
    </nav>
  );
}
