import { useCallback, useEffect } from 'react';

import { usePreviewStore } from '../store/usePreviewStore';
import { PreviewInstance } from './PreviewInstance';
import { PreviewThumbnail } from './PreviewThumbnail';
import { WorkspaceToolbar } from './WorkspaceToolbar';

export function PreviewWorkspace() {
  const entries = usePreviewStore((s) => s.entries);
  const sharedUrl = usePreviewStore((s) => s.sharedUrl);
  const activeId = usePreviewStore((s) => s.activeId);
  const layoutMode = usePreviewStore((s) => s.layoutMode);
  const lifecycleStatus = usePreviewStore((s) => s.lifecycleStatus);
  const removeEntry = usePreviewStore((s) => s.removeEntry);
  const setActiveId = usePreviewStore((s) => s.setActiveId);

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorkspaceToolbar hasEntries={hasEntries} />

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
            <p className="text-sm">Add a device above to start previewing</p>
          </div>
        </div>
      )}

      {/* Grid mode */}
      {hasEntries && layoutMode === 'grid' && (
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 overflow-auto p-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex min-h-[400px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
            >
              <PreviewInstance
                entry={entry}
                sharedUrl={sharedUrl}
                onRemove={handleRemove}
              />
            </div>
          ))}
        </div>
      )}

      {/* Focus mode */}
      {hasEntries && layoutMode === 'focus' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Main preview area */}
          <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4 dark:bg-gray-950">
            {activeEntry ? (
              <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <PreviewInstance
                  key={activeEntry.id}
                  entry={activeEntry}
                  sharedUrl={sharedUrl}
                  onRemove={handleRemove}
                />
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-gray-500">
                No preview selected
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto border-t border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
            {entries.map((entry) => (
              <PreviewThumbnail
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                lifecycle={lifecycleStatus[entry.id] ?? 'idle'}
                onClick={() => handleThumbnailClick(entry.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
