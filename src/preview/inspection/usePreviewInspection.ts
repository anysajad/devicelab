import { useEffect } from 'react';

import { inspectDocument } from '@/inspection';
import type { InspectionResult } from '@/inspection';
import { usePreviewStore } from '../store/usePreviewStore';
import type { PreviewBackend } from '../backend';
import type { PreviewInstanceId } from '../types';

/**
 * Run the inspection engine for one preview entry and store the result.
 *
 * The workspace owns a single "Inspect" toggle. When active, every mounted
 * PreviewInstance (i.e. the currently visible set — grid shows all, focus
 * shows the active entry, compare shows the selected entries) reacts to the
 * shared `inspectionRequest` token and inspects its own preview. Results are
 * keyed by PreviewInstanceId and stored in Zustand so the diagnostics panel
 * (a sibling) can read them without prop drilling.
 *
 * Inspection is fully decoupled from PreviewEngine state: this hook only asks
 * the backend for inspection access + viewport; it never mutates it. The
 * engine's `inspectDocument` is side-effect-free on the preview. The backend's
 * `getInspectionAccess()` keeps this backend-neutral — a browser-backed
 * backend can signal the same pending/inaccessible/available states without
 * exposing iframe specifics.
 */
export function usePreviewInspection(
  entryId: PreviewInstanceId,
  backend: PreviewBackend
): void {
  const inspectionActive = usePreviewStore((s) => s.inspectionActive);
  const inspectionRequest = usePreviewStore((s) => s.inspectionRequest);
  const setInspectionResult = usePreviewStore((s) => s.setInspectionResult);

  useEffect(() => {
    if (!inspectionActive) return;

    const access = backend.getInspectionAccess();

    if (access.status === 'pending') {
      // No surface yet or the document is not ready. Nothing meaningful to
      // inspect yet.
      setInspectionResult(entryId, { phase: 'idle' });
      return;
    }

    if (access.status === 'inaccessible') {
      setInspectionResult(entryId, {
        phase: 'inaccessible',
        inspectedAt: Date.now(),
        inaccessibleReason: access.reason,
      });
      return;
    }

    setInspectionResult(entryId, { phase: 'running' });

    let result: InspectionResult;
    try {
      result = inspectDocument(access.document, {
        width: backend.getState().viewport.width,
        height: backend.getState().viewport.height,
      });
    } catch (err) {
      setInspectionResult(entryId, {
        phase: 'error',
        inspectedAt: Date.now(),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const inspectedAt = result.inspectedAt;
    switch (result.status.status) {
      case 'ready': {
        const st = result.status;
        setInspectionResult(entryId, {
          phase: 'ready',
          inspectedAt,
          diagnostics: st.diagnostics,
          elementsScanned: st.elementsScanned,
          largeDom: st.largeDom,
          checkerFailures: st.checkerFailures,
        });
        break;
      }
      case 'inaccessible':
        setInspectionResult(entryId, {
          phase: 'inaccessible',
          inspectedAt,
          inaccessibleReason: result.status.reason,
        });
        break;
      case 'loading':
        setInspectionResult(entryId, { phase: 'idle', inspectedAt });
        break;
      case 'error':
        setInspectionResult(entryId, {
          phase: 'error',
          inspectedAt,
          errorMessage: result.status.message,
        });
        break;
    }
  }, [
    inspectionActive,
    inspectionRequest,
    entryId,
    backend,
    setInspectionResult,
  ]);
}
