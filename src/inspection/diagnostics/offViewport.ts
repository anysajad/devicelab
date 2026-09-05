import type { Diagnostic, DiagnosticChecker } from '../types';
import type { MeasurementAdapter, ViewportSize } from '../types';
import {
  createElementReference,
  findClippingAncestor,
  findOffViewportAncestor,
  generateDiagnosticId,
  getElementRect,
  getStyle,
  hasZeroArea,
  isFixedOrSticky,
  isFullyOutsideViewport,
  isHidden,
  isNonVisualTag,
  isOutsideViewportWithTolerance,
  isTinyElement,
} from '../utils';

/** Maximum off-viewport diagnostics to report. */
const CAP = 20;

/** Ignore violations within this many pixels of a viewport edge. */
const EDGE_TOLERANCE_PX = 1;

interface OffViewportClassification {
  fully: boolean;
}

/**
 * Detect meaningful visible elements extending outside the viewport.
 *
 * Conservative: excludes display:none, visibility:hidden, zero/tiny area,
 * non-visual tags, fixed/sticky (handled by fixedOverlap), aria-hidden and
 * [hidden] subtrees.
 *
 * Refinements:
 * - 1px edge tolerance: sub-pixel bleed is ignored.
 * - Crop-aware skip: elements clipped by an in-viewport overflow:hidden/clip
 *   ancestor are intentionally cropped, not wayward.
 * - Root-cause dedup: if an ancestor is itself entirely off-viewport, only
 *   the shallowest offending element is reported.
 */
export const offViewportChecker: DiagnosticChecker = (ctx) => {
  const { viewport, measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  for (const el of ctx.elements) {
    if (diagnostics.length >= CAP) break;
    const classification = classify(el, viewport, measurements);
    if (!classification) continue;

    const element = createElementReference(el);
    const rect = getElementRect(el, measurements);
    const severity: Diagnostic['severity'] = classification.fully
      ? 'warning'
      : 'info';

    const metadata: Record<string, unknown> = {
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };

    const id = generateDiagnosticId('off-viewport', element, metadata);

    const message = classification.fully
      ? `Element is entirely outside the viewport (position: ${Math.round(rect.x)}, ${Math.round(rect.y)}).`
      : `Element extends outside the viewport (rect: ${Math.round(rect.left)}–${Math.round(rect.right)}, ${Math.round(rect.top)}–${Math.round(rect.bottom)}).`;

    diagnostics.push({
      id,
      type: 'off-viewport',
      severity,
      message,
      element,
      metadata,
    });
  }

  // If capped, add metadata about suppressed findings
  if (diagnostics.length >= CAP) {
    // Check if there are more by continuing the scan
    let additionalCount = 0;
    for (const el of ctx.elements) {
      if (classify(el, viewport, measurements)) additionalCount++;
    }
    if (additionalCount > CAP) {
      const suppressedCount = additionalCount - CAP;
      diagnostics.push({
        id: generateDiagnosticId('off-viewport', undefined, {
          suppressed: suppressedCount,
        }),
        type: 'off-viewport',
        severity: 'info',
        message: `${suppressedCount} additional off-viewport element${suppressedCount !== 1 ? 's' : ''} not shown (cap reached).`,
        metadata: { suppressed: suppressedCount, cap: CAP },
      });
    }
  }

  return diagnostics;
};

/**
 * Classify an element as off-viewport, applying all exclusions.
 * Returns null when the element should not be reported.
 */
function classify(
  el: Element,
  viewport: ViewportSize,
  measurements: MeasurementAdapter
): OffViewportClassification | null {
  // Tag-based exclusion
  if (isNonVisualTag(el)) return null;

  // Style-based exclusion
  const style = getStyle(el, measurements);
  if (isHidden(style)) return null;

  // Fixed/sticky exclusion — handled by fixedOverlap checker
  if (isFixedOrSticky(style)) return null;

  // Accessibility/attribute exclusion — hidden from rendering
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) {
    return null;
  }

  const rect = getElementRect(el, measurements);

  // Zero-area exclusion
  if (hasZeroArea(rect)) return null;

  // Tiny element exclusion (< 2x2)
  if (isTinyElement(rect)) return null;

  // Edge tolerance: ignore violations of 1px or less
  if (!isOutsideViewportWithTolerance(rect, viewport, EDGE_TOLERANCE_PX)) {
    return null;
  }

  const fully = isFullyOutsideViewport(rect, viewport);

  // Crop-aware skip: an in-viewport overflow:hidden/clip ancestor clips
  // this element by design — do not blame it individually.
  const horizontalViolation =
    rect.left < -EDGE_TOLERANCE_PX ||
    rect.right > viewport.width + EDGE_TOLERANCE_PX;
  const verticalViolation =
    rect.top < -EDGE_TOLERANCE_PX ||
    rect.bottom > viewport.height + EDGE_TOLERANCE_PX;
  if (
    (horizontalViolation &&
      findClippingAncestor(el, 'x', viewport, measurements)) ||
    (verticalViolation && findClippingAncestor(el, 'y', viewport, measurements))
  ) {
    return null;
  }

  // Root-cause dedup: if a fully-off-viewport ancestor exists, that ancestor
  // is the shallowest offender — skip this descendant.
  if (fully && findOffViewportAncestor(el, viewport, measurements)) {
    return null;
  }

  return { fully };
}
