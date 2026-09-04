import type { Diagnostic, DiagnosticChecker } from '../types';
import {
  createElementReference,
  generateDiagnosticId,
  getElementRect,
  getStyle,
  hasZeroArea,
  isFixedOrSticky,
  isHidden,
  isNonVisualTag,
  isTinyElement,
} from '../utils';

/** Maximum off-viewport diagnostics to report. */
const CAP = 20;

/**
 * Detect meaningful visible elements extending outside the viewport.
 *
 * Conservative: excludes display:none, visibility:hidden, zero/tiny area,
 * non-visual tags, fixed/sticky (handled by fixedOverlap).
 *
 * Each violating element gets at most one diagnostic. Partial clipping counts.
 */
export const offViewportChecker: DiagnosticChecker = (ctx) => {
  const { viewport, measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  for (const el of ctx.elements) {
    if (diagnostics.length >= CAP) break;

    // Tag-based exclusion
    if (isNonVisualTag(el)) continue;

    // Style-based exclusion
    const style = getStyle(el, measurements);
    if (isHidden(style)) continue;

    // Fixed/sticky exclusion — handled by fixedOverlap checker
    if (isFixedOrSticky(style)) continue;

    const rect = getElementRect(el, measurements);

    // Zero-area exclusion
    if (hasZeroArea(rect)) continue;

    // Tiny element exclusion (< 2x2)
    if (isTinyElement(rect)) continue;

    // Check if element extends outside viewport
    const isFullyOutside =
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= viewport.width ||
      rect.top >= viewport.height;

    const isPartiallyOutside =
      rect.left < 0 ||
      rect.top < 0 ||
      rect.right > viewport.width ||
      rect.bottom > viewport.height;

    if (!isFullyOutside && !isPartiallyOutside) continue;

    const element = createElementReference(el);
    const severity: Diagnostic['severity'] = isFullyOutside
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

    const message = isFullyOutside
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
      if (isNonVisualTag(el)) continue;
      const style = getStyle(el, measurements);
      if (isHidden(style) || isFixedOrSticky(style)) continue;
      const rect = getElementRect(el, measurements);
      if (hasZeroArea(rect) || isTinyElement(rect)) continue;
      const isFullyOutside =
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= viewport.width ||
        rect.top >= viewport.height;
      const isPartiallyOutside =
        rect.left < 0 ||
        rect.top < 0 ||
        rect.right > viewport.width ||
        rect.bottom > viewport.height;
      if (isFullyOutside || isPartiallyOutside) {
        additionalCount++;
      }
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
