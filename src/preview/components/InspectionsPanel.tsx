import { useCallback, useMemo, useState } from 'react';

import { getDeviceById } from '@/devices';
import type { Diagnostic, DiagnosticSeverity } from '@/inspection';
import { clearAllIframeHighlights } from '../inspection/highlight';
import { usePreviewStore } from '../store/usePreviewStore';
import type {
  InspectionPhase,
  PreviewInstanceId,
  PreviewController,
} from '../types';
import { DiagnosticItem } from './DiagnosticItem';

const SEVERITY_ORDER: DiagnosticSeverity[] = ['error', 'warning', 'info'];

interface DiagnosticsGroup {
  entryId: PreviewInstanceId;
  deviceLabel: string;
  phase: InspectionPhase;
  diagnostics: Diagnostic[];
  reason?: string;
  errorMessage?: string;
}

interface InspectionsPanelProps {
  /** Resolve the controller for a given preview entry (for highlighting). */
  getController: (id: PreviewInstanceId) => PreviewController | undefined;
  /** Close the inspection panel and clear results. */
  onClose: () => void;
}

export function InspectionsPanel({
  getController,
  onClose,
}: InspectionsPanelProps) {
  const inspectionResults = usePreviewStore((s) => s.inspectionResults);
  const entries = usePreviewStore((s) => s.entries);
  const layoutMode = usePreviewStore((s) => s.layoutMode);
  const activeId = usePreviewStore((s) => s.activeId);
  const compareIds = usePreviewStore((s) => s.compareIds);
  const requestInspection = usePreviewStore((s) => s.requestInspection);

  // Which entry IDs are currently visible in the workspace.
  const visibleIds = useMemo(() => {
    if (layoutMode === 'focus' && activeId) return [activeId];
    if (layoutMode === 'compare') return compareIds;
    return entries.map((e) => e.id);
  }, [layoutMode, activeId, compareIds, entries]);

  // Group diagnostics by visible entry, preserving device order. The phase is
  // carried through so the panel can display honest per-device states instead
  // of implying "No issues" for devices that were never scanned.
  const groups = useMemo<DiagnosticsGroup[]>(() => {
    return visibleIds
      .map((id): DiagnosticsGroup | null => {
        const snapshot = inspectionResults[id];
        const entry = entries.find((e) => e.id === id);
        if (!entry) return null;
        const device = getDeviceById(entry.deviceId);
        const deviceLabel =
          device?.name ??
          (entry?.viewportMode === 'custom' ? 'Custom' : 'Unknown');
        // A visible device without a snapshot is honest shown as "not scanned".
        if (!snapshot) {
          return { entryId: id, deviceLabel, phase: 'idle', diagnostics: [] };
        }
        const phase = snapshot.phase;
        return {
          entryId: id,
          deviceLabel,
          phase,
          diagnostics:
            phase === 'ready' ? [...(snapshot.diagnostics ?? [])] : [],
          ...(snapshot.inaccessibleReason !== undefined
            ? { reason: snapshot.inaccessibleReason }
            : {}),
          ...(snapshot.errorMessage !== undefined
            ? { errorMessage: snapshot.errorMessage }
            : {}),
        };
      })
      .filter((g): g is DiagnosticsGroup => g !== null);
  }, [visibleIds, inspectionResults, entries]);

  // Summary counts (across all visible entries).
  const summary = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    let total = 0;
    let scanned = 0;
    let readyCount = 0;
    let hasLargeDom = false;
    let hasInaccessible = false;
    let hasCrossOrigin = false;
    let hasUnavailable = false;
    let hasError = false;
    let hasRunning = false;
    let hasIdle = false;

    for (const id of visibleIds) {
      const snap = inspectionResults[id];
      if (!snap) {
        hasIdle = true;
        continue;
      }
      switch (snap.phase) {
        case 'running':
          hasRunning = true;
          break;
        case 'ready':
          readyCount++;
          for (const d of snap.diagnostics ?? []) {
            total++;
            if (d.severity === 'error') errors++;
            else if (d.severity === 'warning') warnings++;
            else infos++;
          }
          scanned += snap.elementsScanned ?? 0;
          if (snap.largeDom) hasLargeDom = true;
          break;
        case 'inaccessible':
          hasInaccessible = true;
          if (snap.inaccessibleReason === 'contentDocument-unavailable') {
            hasUnavailable = true;
          } else {
            hasCrossOrigin = true;
          }
          break;
        case 'error':
          hasError = true;
          break;
        default:
          hasIdle = true;
          break;
      }
    }

    return {
      errors,
      warnings,
      infos,
      total,
      scanned,
      readyCount,
      hasLargeDom,
      hasInaccessible,
      hasCrossOrigin,
      hasUnavailable,
      hasError,
      hasRunning,
      hasIdle,
    };
  }, [visibleIds, inspectionResults]);

  const [highlightedIds, setHighlightedIds] = useState<
    Record<string, string | null>
  >({});

  const handleToggleHighlight = useCallback(
    (entryId: string, diagnosticId: string) => {
      setHighlightedIds((prev) => ({
        ...prev,
        [entryId]: prev[entryId] === diagnosticId ? null : diagnosticId,
      }));
    },
    []
  );

  const handleRescan = useCallback(() => {
    setHighlightedIds({});
    clearAllIframeHighlights(
      (id) => getController(id)?.getIframe()?.contentDocument ?? null,
      visibleIds
    );
    requestInspection();
  }, [setHighlightedIds, requestInspection, getController, visibleIds]);

  return (
    <aside
      className="flex w-full flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:w-[360px]"
      aria-label="Inspection results"
      role="region"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Diagnostics
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRescan}
            className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
            aria-label="Rescan"
          >
            Rescan
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close inspection panel"
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
        </div>
      </div>

      {/* Summary badge row */}
      <div
        className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-2 dark:border-gray-800"
        aria-live="polite"
      >
        {summary.hasRunning && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Scanning...
          </span>
        )}
        {summary.errors > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {summary.errors} error{summary.errors !== 1 ? 's' : ''}
          </span>
        )}
        {summary.warnings > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
          </span>
        )}
        {summary.infos > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {summary.infos} info
          </span>
        )}
        {!summary.hasRunning &&
          summary.total === 0 &&
          summary.readyCount === visibleIds.length &&
          visibleIds.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {visibleIds.length} device{visibleIds.length !== 1 ? 's' : ''}{' '}
              scanned
            </span>
          )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {/* Idle / no results state */}
        {!summary.hasRunning &&
          summary.total === 0 &&
          (summary.hasIdle || visibleIds.length === 0) && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg
                className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Click Inspect or Rescan to check for issues
              </p>
            </div>
          )}

        {/* No issues found */}
        {!summary.hasRunning &&
          !summary.hasIdle &&
          summary.total === 0 &&
          !summary.hasInaccessible &&
          !summary.hasError && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg
                className="mb-2 h-8 w-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                No issues found
              </p>
              {summary.scanned > 0 && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {summary.scanned} elements scanned
                  {summary.hasLargeDom ? ' (limited by large DOM)' : ''}
                </p>
              )}
            </div>
          )}

        {/* Inaccessible banner */}
        {summary.hasInaccessible && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
            {summary.hasCrossOrigin && summary.hasUnavailable
              ? 'Some pages are cross-origin or could not be accessed by the browser. They will be skipped.'
              : summary.hasCrossOrigin
                ? 'Some pages are cross-origin and cannot be inspected. They will be skipped.'
                : 'Some pages could not be accessed by the browser. They will be skipped.'}
          </div>
        )}

        {/* Error banner */}
        {summary.hasError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
            One or more inspections failed. Check individual device sections for
            details.
          </div>
        )}

        {/* Diagnostic groups */}
        {groups.map((group) => (
          <div key={group.entryId} className="mb-4">
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {group.deviceLabel}
            </h3>
            {group.diagnostics.length > 0 ? (
              <ul
                className="flex flex-col gap-1"
                role="list"
                aria-label={`${group.deviceLabel} diagnostics`}
              >
                {group.diagnostics
                  .slice()
                  .sort(
                    (a, b) =>
                      SEVERITY_ORDER.indexOf(a.severity) -
                      SEVERITY_ORDER.indexOf(b.severity)
                  )
                  .map((diag) => (
                    <DiagnosticItem
                      key={diag.id}
                      diagnostic={diag}
                      controller={getController(group.entryId)}
                      highlightedId={highlightedIds[group.entryId] ?? null}
                      onToggleHighlight={(diagId) =>
                        handleToggleHighlight(group.entryId, diagId)
                      }
                    />
                  ))}
              </ul>
            ) : group.phase === 'ready' ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No issues
              </p>
            ) : group.phase === 'error' ? (
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Inspection failed
                </p>
                {group.errorMessage && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {group.errorMessage}
                  </p>
                )}
              </div>
            ) : group.phase === 'running' ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Scanning…
              </p>
            ) : group.phase === 'idle' ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Not scanned
              </p>
            ) : group.reason === 'contentDocument-unavailable' ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Cannot be inspected (browser could not access the page)
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Cross-origin — cannot be inspected
              </p>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
