import { useCallback, useEffect, useRef, useState } from 'react';

import { usePreviewStore } from '../store/usePreviewStore';
import { clearHighlight } from '../inspection/highlight';
import type { PreviewBackend } from '../backend';
import type { PreviewInstanceId } from '../types';
import { CompareThumbnail } from './CompareThumbnail';
import { InspectionsPanel } from './InspectionsPanel';
import { PreviewInstance } from './PreviewInstance';
import { PreviewThumbnail } from './PreviewThumbnail';
import { WorkspaceToolbar } from './WorkspaceToolbar';

/**
 * Preview layout container classes per mode. The instance cards are ALWAYS
 * mounted (one PreviewInstance per entry) and simply hidden with CSS — the
 * layout controls only change which cards are visible. This preserves each
 * instance's controller/iframe across layout switches instead of remounting a
 * fresh controller (which used to reload the frame and lose zoom state).
 */
const GRID_CONTAINER_CLASSES =
  'grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 overflow-auto p-4';
const FOCUS_CONTAINER_CLASSES =
  'flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4 dark:bg-gray-950';
const COMPARE_CONTAINER_CLASSES =
  'grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 content-start overflow-auto p-4';

const CARD_BASE_CLASSES =
  'flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';

export function PreviewWorkspace() {
  const entries = usePreviewStore((s) => s.entries);
  const sharedUrl = usePreviewStore((s) => s.sharedUrl);
  const activeId = usePreviewStore((s) => s.activeId);
  const layoutMode = usePreviewStore((s) => s.layoutMode);
  const compareIds = usePreviewStore((s) => s.compareIds);
  const lifecycleStatus = usePreviewStore((s) => s.lifecycleStatus);
  const removeEntry = usePreviewStore((s) => s.removeEntry);
  const setActiveId = usePreviewStore((s) => s.setActiveId);
  const toggleCompareEntry = usePreviewStore((s) => s.toggleCompareEntry);
  const inspectionActive = usePreviewStore((s) => s.inspectionActive);
  const setInspectionActive = usePreviewStore((s) => s.setInspectionActive);

  // Add Device menu visibility, lifted from WorkspaceToolbar so the
  // empty-state CTA can open the same menu.
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Stable backend registry. Updated by each PreviewInstance on mount/unmount
  // so the diagnostics panel can resolve inspection documents for highlighting
  // without prop drilling through the workspace.
  const backendsRef = useRef<Map<PreviewInstanceId, PreviewBackend>>(new Map());

  const handleBackendReady = useCallback(
    (id: PreviewInstanceId, backend: PreviewBackend | null) => {
      if (backend) backendsRef.current.set(id, backend);
      else backendsRef.current.delete(id);
    },
    []
  );

  const getBackend = useCallback(
    (id: PreviewInstanceId) => backendsRef.current.get(id),
    []
  );

  const handleClosePanel = useCallback(() => {
    // Clear any active highlights in the preview documents.
    const entriesSnapshot = usePreviewStore.getState().entries;
    for (const entry of entriesSnapshot) {
      const access = backendsRef.current.get(entry.id)?.getInspectionAccess();
      const doc = access?.status === 'available' ? access.document : null;
      if (doc) clearHighlight(doc);
    }
    setInspectionActive(false);
  }, [setInspectionActive]);

  const hasEntries = entries.length > 0;

  // Ensure activeId is valid when in focus mode.
  useEffect(() => {
    if (layoutMode === 'focus' && hasEntries) {
      const activeExists = entries.some((e) => e.id === activeId);
      if (!activeExists) {
        setActiveId(entries[0]!.id);
      }
    }
  }, [layoutMode, hasEntries, entries, activeId, setActiveId]);

  const handleRemove = useCallback(
    (id: string) => {
      removeEntry(id);
    },
    [removeEntry]
  );

  const handleThumbnailClick = useCallback(
    (id: string) => {
      setActiveId(id);
    },
    [setActiveId]
  );

  // Get the active entry for focus mode
  const activeEntry =
    activeId != null ? entries.find((e) => e.id === activeId) : null;

  // Get entries for compare mode
  const compareEntrySet = new Set(compareIds);

  // Determine the container + per-card classes for the current layout.
  const containerClasses =
    layoutMode === 'focus'
      ? FOCUS_CONTAINER_CLASSES
      : layoutMode === 'compare'
        ? COMPARE_CONTAINER_CLASSES
        : GRID_CONTAINER_CLASSES;

  const isCardVisible = (id: string): boolean => {
    if (layoutMode === 'focus') return id === activeId;
    if (layoutMode === 'compare') return compareEntrySet.has(id);
    return true;
  };

  const hasThumbnailStrip = layoutMode === 'focus' || layoutMode === 'compare';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorkspaceToolbar
        hasEntries={hasEntries}
        addMenuOpen={addMenuOpen}
        onAddMenuOpenChange={setAddMenuOpen}
      />

      {/* Empty state */}
      {!hasEntries && (
        <div className="flex flex-1 items-center justify-center bg-gray-100 dark:bg-gray-950">
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
              Start by adding a device below, then set a URL to preview it.
            </p>
            <button
              type="button"
              onClick={() => setAddMenuOpen(true)}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Add a device
            </button>
          </div>
        </div>
      )}

      {/* Content area — split between previews and diagnostics panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Workspace with previews */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Single always-mounted instance list; CSS-visibility drives layout. */}
          <div className={containerClasses}>
            {entries.map((entry) =>
              isCardVisible(entry.id) ? (
                <div
                  key={entry.id}
                  className={`${CARD_BASE_CLASSES} ${
                    layoutMode === 'focus' ? 'h-full w-full' : 'min-h-[400px]'
                  }`}
                >
                  <PreviewInstance
                    entry={entry}
                    sharedUrl={sharedUrl}
                    onRemove={handleRemove}
                    onBackendReady={handleBackendReady}
                  />
                </div>
              ) : (
                <div
                  key={entry.id}
                  className={`${CARD_BASE_CLASSES} hidden`}
                  aria-hidden="true"
                >
                  <PreviewInstance
                    entry={entry}
                    sharedUrl={sharedUrl}
                    onRemove={handleRemove}
                    onBackendReady={handleBackendReady}
                  />
                </div>
              )
            )}
            {hasEntries && layoutMode === 'focus' && !activeEntry && (
              <div className="text-sm text-gray-400 dark:text-gray-500">
                No preview selected
              </div>
            )}
          </div>

          {/* Thumbnail strip (focus + compare modes) */}
          {hasEntries && hasThumbnailStrip && (
            <div className="flex gap-2 overflow-x-auto border-t border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
              {entries.map((entry) =>
                layoutMode === 'focus' ? (
                  <PreviewThumbnail
                    key={entry.id}
                    entry={entry}
                    isActive={entry.id === activeId}
                    lifecycle={lifecycleStatus[entry.id] ?? 'idle'}
                    onClick={() => handleThumbnailClick(entry.id)}
                  />
                ) : (
                  <CompareThumbnail
                    key={entry.id}
                    entry={entry}
                    isSelected={compareEntrySet.has(entry.id)}
                    lifecycle={lifecycleStatus[entry.id] ?? 'idle'}
                    onToggle={() => toggleCompareEntry(entry.id)}
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* Diagnostics panel (right side) */}
        {inspectionActive && (
          <InspectionsPanel
            getBackend={getBackend}
            onClose={handleClosePanel}
          />
        )}
      </div>
    </div>
  );
}
