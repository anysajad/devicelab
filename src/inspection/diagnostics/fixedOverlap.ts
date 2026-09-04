import type { Diagnostic, DiagnosticChecker } from '../types';
import {
  createElementReference,
  generateDiagnosticId,
  getContentCandidates,
  getElementRect,
  getStyle,
  intersectionArea,
  isDescendantOf,
} from '../utils';

/** Minimum fixed/sticky overlay area to consider (px²). */
const MIN_OVERLAY_AREA = 100;

/** Minimum intersection area to report overlap (px²). */
const MIN_INTERSECTION_AREA = 500;

/** Minimum overlap as a fraction of the content candidate area. */
const MIN_OVERLAP_FRACTION = 0.1;

/** Cap on fixed/sticky overlay candidates. */
const MAX_OVERLAY_CANDIDATES = 20;

/** Cap on content candidates. */
const MAX_CONTENT_CANDIDATES = 50;

/** Cap on reported overlap diagnostics. */
const MAX_DIAGNOSTICS = 10;

/**
 * Detect potentially problematic fixed/sticky elements that overlap
 * meaningful page content.
 *
 * Conservative:
 * - Only reports overlap when current geometry satisfies thresholds.
 * - Skips self/ancestor-descendant relationships.
 * - Bounded candidate sets avoid O(n²) across the entire DOM.
 * - Sticky elements explicitly carry uncertainty metadata.
 */
export const fixedOverlapChecker: DiagnosticChecker = (ctx) => {
  const { document, measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  // Collect fixed/sticky overlay candidates (bounded)
  const overlayCandidates: Element[] = [];
  for (const el of ctx.elements) {
    if (overlayCandidates.length >= MAX_OVERLAY_CANDIDATES) break;
    const style = getStyle(el, measurements);
    if (style.position === 'fixed' || style.position === 'sticky') {
      const rect = getElementRect(el, measurements);
      if (rect.width * rect.height >= MIN_OVERLAY_AREA) {
        overlayCandidates.push(el);
      }
    }
  }

  if (overlayCandidates.length === 0) return [];

  // Collect content candidates (bounded)
  const contentCandidates = getContentCandidates(
    document,
    MAX_CONTENT_CANDIDATES
  );

  for (const overlay of overlayCandidates) {
    if (diagnostics.length >= MAX_DIAGNOSTICS) break;

    const overlayStyle = getStyle(overlay, measurements);
    const overlayRect = getElementRect(overlay, measurements);
    const overlayArea = overlayRect.width * overlayRect.height;
    if (overlayArea < MIN_OVERLAY_AREA) continue;

    for (const content of contentCandidates) {
      if (diagnostics.length >= MAX_DIAGNOSTICS) break;

      // Exclude ancestor/descendant relationships (expected overlap)
      if (
        isDescendantOf(overlay, content) ||
        isDescendantOf(content, overlay)
      ) {
        continue;
      }

      const contentRect = getElementRect(content, measurements);
      const contentArea = contentRect.width * contentRect.height;
      if (contentArea <= 0) continue;

      const intersection = intersectionArea(overlayRect, contentRect);
      if (intersection < MIN_INTERSECTION_AREA) continue;

      if (intersection / contentArea < MIN_OVERLAP_FRACTION) continue;

      const isSticky = overlayStyle.position === 'sticky';

      const element = createElementReference(overlay);
      const metadata: Record<string, unknown> = {
        overlaySelector: element.selector,
        contentSelector: createElementReference(content).selector,
        intersectionArea: Math.round(intersection),
        overlayArea: Math.round(overlayArea),
        contentArea: Math.round(contentArea),
        zIndex: overlayStyle.zIndex || 'auto',
      };

      if (isSticky) {
        // We cannot determine whether a sticky element is currently stuck.
        metadata.stickyState = 'possibly-not-stuck';
      }

      const id = generateDiagnosticId('fixed-overlap', element, metadata);

      diagnostics.push({
        id,
        type: 'fixed-overlap',
        severity: 'warning',
        message: `${isSticky ? 'Sticky' : 'Fixed'} element overlaps meaningful page content with ${Math.round(intersection)}px² of shared area.${isSticky ? ' Note: the sticky element may not currently be stuck.' : ''}`,
        element,
        metadata,
      });
    }
  }

  return diagnostics;
};
