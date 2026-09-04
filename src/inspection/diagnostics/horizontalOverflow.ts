import type { Diagnostic, DiagnosticChecker } from '../types';
import {
  createElementReference,
  generateDiagnosticId,
  getElementRect,
  getStyle,
} from '../utils';

/** Subpixel/browser rounding tolerance in pixels. */
const TOLERANCE_PX = 2;

/**
 * Detect document-level horizontal overflow.
 *
 * Produces AT MOST ONE diagnostic per inspection. Does not report
 * individual overflowing descendants — instead identifies the most
 * likely source element and attaches it to the single diagnostic.
 */
export const horizontalOverflowChecker: DiagnosticChecker = (ctx) => {
  const { document, viewport, measurements } = ctx;

  // Measure document-level scroll widths
  const docElScrollWidth = measurements.getScrollWidth(
    document.documentElement
  );
  const bodyScrollWidth = document.body
    ? measurements.getScrollWidth(document.body)
    : 0;
  const effectiveScrollWidth = Math.max(docElScrollWidth, bodyScrollWidth);

  // Apply subpixel tolerance
  if (effectiveScrollWidth <= viewport.width + TOLERANCE_PX) {
    return [];
  }

  const overflowPx = effectiveScrollWidth - viewport.width;

  // Determine severity
  let severity: Diagnostic['severity'];
  if (overflowPx > 200) {
    severity = 'error';
  } else if (overflowPx > 20) {
    severity = 'warning';
  } else {
    severity = 'info';
  }

  // Find the most likely source element:
  // Walk elements, find those extending past viewport, prefer ones closest to root.
  let bestSource: Element | null = null;
  let bestDepth = Infinity;

  for (const el of ctx.elements) {
    const rect = getElementRect(el, measurements);
    if (rect.right > viewport.width + TOLERANCE_PX) {
      // Calculate depth in DOM tree
      let depth = 0;
      let node: Element | null = el;
      while (node.parentElement) {
        depth++;
        node = node.parentElement;
      }
      // Prefer elements with explicit width styles as likely source
      const style = getStyle(el, measurements);
      const hasExplicitWidth =
        style.width !== 'auto' && style.width !== '' && style.width !== '0px';
      const adjustedDepth = hasExplicitWidth ? depth - 0.5 : depth;

      if (adjustedDepth < bestDepth) {
        bestDepth = adjustedDepth;
        bestSource = el;
      }
    }
  }

  const metadata: Record<string, unknown> = {
    overflowPx: Math.round(overflowPx * 100) / 100,
    scrollWidth: effectiveScrollWidth,
    viewportWidth: viewport.width,
  };

  const element = bestSource ? createElementReference(bestSource) : undefined;

  const id = generateDiagnosticId('horizontal-overflow', element, metadata);

  return [
    {
      id,
      type: 'horizontal-overflow',
      severity,
      message: `Page content overflows horizontally by ${Math.round(overflowPx)}px (${effectiveScrollWidth}px wide in a ${viewport.width}px viewport).`,
      element,
      metadata,
    },
  ];
};
