import { useCallback, useEffect, useRef, useState } from 'react';

import { getDevicesByCategory } from '@/devices';
import type { DeviceCategory, DeviceDefinition } from '@/devices';
import { sanitizeUrl } from '../previewUtils';
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
  /**
   * Optional controlled Add Device menu state. When `onAddMenuOpenChange` is
   * provided the toolbar defers menu visibility to the parent (so the
   * empty-state CTA can open it); otherwise it manages its own local state.
   */
  addMenuOpen?: boolean;
  onAddMenuOpenChange?: (open: boolean) => void;
}

export function WorkspaceToolbar({
  hasEntries,
  addMenuOpen,
  onAddMenuOpenChange,
}: WorkspaceToolbarProps) {
  const sharedUrl = usePreviewStore((s) => s.sharedUrl);
  const setSharedUrl = usePreviewStore((s) => s.setSharedUrl);
  const entries = usePreviewStore((s) => s.entries);
  const layoutMode = usePreviewStore((s) => s.layoutMode);
  const setLayoutMode = usePreviewStore((s) => s.setLayoutMode);
  const addEntry = usePreviewStore((s) => s.addEntry);
  const enterCompareMode = usePreviewStore((s) => s.enterCompareMode);
  const exitCompareMode = usePreviewStore((s) => s.exitCompareMode);
  const inspectionActive = usePreviewStore((s) => s.inspectionActive);
  const requestInspection = usePreviewStore((s) => s.requestInspection);
  const setInspectionActive = usePreviewStore((s) => s.setInspectionActive);

  const [urlInput, setUrlInput] = useState(sharedUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = addMenuOpen !== undefined;
  const open = isControlled ? addMenuOpen : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) onAddMenuOpenChange?.(next);
      else setInternalOpen(next);
    },
    [isControlled, onAddMenuOpenChange]
  );

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
    // Surface invalid input without blocking the submit or the ability to
    // clear the URL (an empty reset stays valid).
    const trimmed = urlInput.trim();
    setUrlError(
      trimmed !== '' && sanitizeUrl(urlInput) === 'about:blank'
        ? "That doesn't look like a valid URL."
        : null
    );
  }, [urlInput, setSharedUrl]);

  const handleUrlChange = useCallback((value: string) => {
    setUrlInput(value);
    setUrlError((prev) => (prev !== null ? null : prev));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSubmitUrl();
      }
    },
    [handleSubmitUrl]
  );

  // --- Add Device menu keyboard semantics + outside-click dismissal ---
  const addMenuWrapperRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const firstItem =
      addMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
    const onDocMouseDown = (e: MouseEvent) => {
      if (
        addMenuWrapperRef.current &&
        !addMenuWrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, setOpen]);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = Array.from(
        addMenuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]'
        ) ?? []
      );
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      let next = index;
      switch (e.key) {
        case 'ArrowDown':
          next = index < 0 ? 0 : (index + 1) % items.length;
          e.preventDefault();
          break;
        case 'ArrowUp':
          next = index <= 0 ? items.length - 1 : index - 1;
          e.preventDefault();
          break;
        case 'Home':
          next = 0;
          e.preventDefault();
          break;
        case 'End':
          next = items.length - 1;
          e.preventDefault();
          break;
        case 'Escape':
          setOpen(false);
          addButtonRef.current?.focus();
          e.preventDefault();
          return;
        default:
          return;
      }
      items[next]?.focus();
    },
    [setOpen]
  );

  const handleAddDevice = useCallback(
    (deviceId: string) => {
      addEntry(deviceId);
      setOpen(false);
    },
    [addEntry, setOpen]
  );

  const handleAddMenuToggle = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const handleCompareClick = useCallback(() => {
    if (layoutMode === 'compare') {
      exitCompareMode();
    } else {
      enterCompareMode();
    }
  }, [layoutMode, enterCompareMode, exitCompareMode]);

  const handleInspectToggle = useCallback(() => {
    if (inspectionActive) {
      setInspectionActive(false);
    } else {
      requestInspection();
    }
  }, [inspectionActive, requestInspection, setInspectionActive]);

  const canCompare = hasEntries && entries.length >= 2;

  return (
    <nav
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
      aria-label="Workspace controls"
    >
      {/* Shared URL input */}
      <div className="flex min-w-[200px] flex-1 flex-col">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSubmitUrl}
          placeholder="Enter URL to preview across devices..."
          className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label="Shared preview URL"
          aria-invalid={urlError !== null}
        />
        {urlError && (
          <p
            className="mt-1 text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            {urlError}
          </p>
        )}
      </div>

      {/* Separator */}
      <div
        className="h-5 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />

      {/* Add Device */}
      <div className="relative" ref={addMenuWrapperRef}>
        <button
          ref={addButtonRef}
          type="button"
          onClick={handleAddMenuToggle}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Add device"
          aria-expanded={open}
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

        {open && (
          <div
            ref={addMenuRef}
            role="menu"
            className="absolute left-0 top-full z-20 mt-1 max-h-80 w-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onKeyDown={handleMenuKeyDown}
          >
            {grouped.map((group) => (
              <div key={group.category}>
                <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  {group.label}
                </div>
                {group.devices.map((d: DeviceDefinition) => (
                  <button
                    key={d.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleAddDevice(d.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:bg-gray-800"
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
          <button
            type="button"
            onClick={handleCompareClick}
            disabled={!canCompare}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layoutMode === 'compare'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            } ${!canCompare ? 'cursor-not-allowed opacity-50' : ''}`}
            aria-label="Compare layout"
            aria-pressed={layoutMode === 'compare'}
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
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 6l12-3"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Separator before Inspect button */}
      {hasEntries && (
        <>
          <div
            className="h-5 w-px bg-gray-200 dark:bg-gray-700"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={handleInspectToggle}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              inspectionActive
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            aria-label="Inspect"
            aria-pressed={inspectionActive}
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Inspect
          </button>
        </>
      )}
    </nav>
  );
}
