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

/** Cap on reported overlay×content diagnostics. */
const MAX_DIAGNOSTICS = 10;

/** Cap on reported fixed-vs-fixed collision diagnostics. */
const MAX_COLLISIONS = 5;

/** ARIA roles that designate overlays/modals (expected page furniture). */
const OVERLAY_ROLES = new Set([
  'dialog',
  'alertdialog',
  'menu',
  'menubar',
  'tooltip',
  'popover',
  'combobox',
  'listbox',
  'tabpanel',
]);

/**
 * Detect potentially problematic fixed/sticky elements that overlap
 * meaningful page content.
 *
 * Conservative:
 * - Only reports overlap when current geometry satisfies thresholds.
 * - Skips self/ancestor-descendant relationships.
 * - Bounded candidate sets avoid O(n²) across the entire DOM.
 * - Sticky elements explicitly carry uncertainty metadata.
 *
 * Refinements:
 * - Overlay/role/modal elements (dialog, menu, tooltip, popover, combobox,
 *   listbox, tabpanel, aria-modal, aria-hidden, disabled, [hidden]) are
 *   expected page furniture and are excluded from overlap reporting.
 * - A second phase reports two fixed/sticky elements that occupy the same
 *   region (fixed-vs-fixed collision), attaching the partner as
 *   `relatedElement`. Bounded to ≤190 pairs from 20 candidates and capped
 *   separately.
 */
export const fixedOverlapChecker: DiagnosticChecker = (ctx) => {
  const { document, measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  // Collect fixed/sticky overlay candidates (bounded)
  const collected: Element[] = [];
  for (const el of ctx.elements) {
    if (collected.length >= MAX_OVERLAY_CANDIDATES) break;
    const style = getStyle(el, measurements);
    if (style.position === 'fixed' || style.position === 'sticky') {
      const rect = getElementRect(el, measurements);
      if (rect.width * rect.height >= MIN_OVERLAY_AREA) {
        collected.push(el);
      }
    }
  }

  // Exclude overlay/modal/disabled furniture from overlap analysis
  const overlayCandidates = collected.filter((el) => !isOverlayLike(el));

  if (overlayCandidates.length === 0) return [];

  // Collect content candidates (bounded)
  const contentCandidates = getContentCandidates(
    document,
    MAX_CONTENT_CANDIDATES
  );

  // --- Phase A: overlay × content ---
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

  // --- Phase B: fixed/sticky × fixed/sticky collision ---
  let collisions = 0;
  for (
    let i = 0;
    i < overlayCandidates.length && collisions < MAX_COLLISIONS;
    i++
  ) {
    const a = overlayCandidates[i]!;
    const aRect = getElementRect(a, measurements);
    const aStyle = getStyle(a, measurements);
    if (aRect.width * aRect.height < MIN_OVERLAY_AREA) continue;

    for (
      let j = i + 1;
      j < overlayCandidates.length && collisions < MAX_COLLISIONS;
      j++
    ) {
      const b = overlayCandidates[j]!;

      // Skip ancestor/descendant pairs (one expectedly overlays the other)
      if (isDescendantOf(a, b) || isDescendantOf(b, a)) continue;

      const bRect = getElementRect(b, measurements);
      const intersection = intersectionArea(aRect, bRect);
      if (intersection < MIN_INTERSECTION_AREA) continue;

      const aRef = createElementReference(a);
      const bStyle = getStyle(b, measurements);

      const metadata: Record<string, unknown> = {
        overlaySelector: aRef.selector,
        collisionSelector: createElementReference(b).selector,
        intersectionArea: Math.round(intersection),
        zIndexA: aStyle.zIndex || 'auto',
        zIndexB: bStyle.zIndex || 'auto',
      };

      const id = generateDiagnosticId('fixed-overlap', aRef, metadata);

      diagnostics.push({
        id,
        type: 'fixed-overlap',
        severity: 'warning',
        message: `${aStyle.position === 'sticky' ? 'Sticky' : 'Fixed'} element overlaps ${bStyle.position === 'sticky' ? 'sticky' : 'fixed'} element in the same region with ${Math.round(intersection)}px² of shared area.`,
        element: aRef,
        relatedElement: createElementReference(b),
        metadata,
      });

      collisions++;
    }
  }

  return diagnostics;
};

/**
 * Check if an element is expected overlay/modal furniture and should be
 * excluded from overlap analysis.
 */
function isOverlayLike(el: Element): boolean {
  const role = el.getAttribute('role');
  if (role && OVERLAY_ROLES.has(role)) return true;
  if (el.getAttribute('aria-modal') === 'true') return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  if (el.hasAttribute('disabled')) return true;
  return false;
}
