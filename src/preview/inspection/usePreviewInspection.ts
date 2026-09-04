import { useEffect } from 'react';

import { inspectIframe } from '@/inspection';
import type { InspectionResult } from '@/inspection';
import { usePreviewStore } from '../store/usePreviewStore';
import type { PreviewController, PreviewInstanceId } from '../types';

/**
 * Run the inspection engine for one preview entry and store the result.
 *
 * The workspace owns a single "Inspect" toggle. When active, every mounted
 * PreviewInstance (i.e. the currently visible set — grid shows all, focus
 * shows the active entry, compare shows the selected entries) reacts to the
 * shared `inspectionRequest` token and inspects its own iframe. Results are
 * keyed by PreviewInstanceId and stored in Zustand so the diagnostics panel
 * (a sibling) can read them without prop drilling.
 *
 * Inspection is fully decoupled from PreviewEngine state: this hook only reads
 * the controller to obtain the iframe + viewport; it never mutates it. The
 * engine's `inspectIframe` is side-effect-free on the preview.
 */
export function usePreviewInspection(
  entryId: PreviewInstanceId,
  controller: PreviewController
): void {
  const inspectionActive = usePreviewStore((s) => s.inspectionActive);
  const inspectionRequest = usePreviewStore((s) => s.inspectionRequest);
  const setInspectionResult = usePreviewStore((s) => s.setInspectionResult);

  useEffect(() => {
    if (!inspectionActive) return;

    const iframe = controller.getIframe();
    if (!iframe) {
      // No iframe yet (not loaded). Nothing meaningful to inspect.
      setInspectionResult(entryId, { phase: 'idle' });
      return;
    }

    setInspectionResult(entryId, { phase: 'running' });

    let result: InspectionResult;
    try {
      result = inspectIframe(iframe, {
        width: controller.getState().viewport.width,
        height: controller.getState().viewport.height,
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
    controller,
    setInspectionResult,
  ]);
}
