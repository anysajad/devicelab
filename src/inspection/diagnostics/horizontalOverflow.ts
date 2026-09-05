import type { Diagnostic, DiagnosticChecker } from '../types';
import {
  createElementReference,
  findClippingAncestor,
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
 *
 * Refinements:
 * - Attribures overflow on either side (RTL pages overflow to the left).
 * - Excludes fixed/sticky and deliberately cropped subtrees from source
 *   attribution (those are not what makes the document scroll).
 * - Downgrades severity when html/body explicitly declare horizontal
 *   scrolling (`overflow-x: auto|scroll`), marking it intentional.
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

  // A declarative overflow-x:auto|scroll on html/body marks the overflow as
  // intentional — downgrade one level rather than suppressing entirely.
  const docStyle = getStyle(document.documentElement, measurements);
  const bodyStyle = document.body
    ? getStyle(document.body, measurements)
    : null;
  const intentionalScroll =
    isHorizontalScrollable(docStyle) ||
    (bodyStyle !== null && isHorizontalScrollable(bodyStyle));
  if (intentionalScroll) {
    severity =
      severity === 'error'
        ? 'warning'
        : severity === 'warning'
          ? 'info'
          : severity;
  }

  // Find the most likely source element:
  // Walk elements, find those extending past viewport (either side — RTL
  // pages overflow to the left), prefer ones closest to root.
  let bestSource: Element | null = null;
  let bestDepth = Infinity;
  let sawRightOverflow = false;
  let sawLeftOverflow = false;

  for (const el of ctx.elements) {
    const rect = getElementRect(el, measurements);

    const extendsRight = rect.right > viewport.width + TOLERANCE_PX;
    const extendsLeft = rect.left < -TOLERANCE_PX;
    if (!extendsRight && !extendsLeft) continue;

    if (extendsRight) sawRightOverflow = true;
    if (extendsLeft) sawLeftOverflow = true;

    const style = getStyle(el, measurements);

    // Fixed/sticky elements are positioned overlays — they do not push the
    // document wider. Skip them as candidate sources.
    if (style.position === 'fixed' || style.position === 'sticky') continue;

    // Elements cropped by an in-viewport overflow:hidden/clip ancestor are
    // clipped by design and do not cause document-level scroll.
    if (findClippingAncestor(el, 'x', viewport, measurements)) continue;

    // Calculate depth in DOM tree
    let depth = 0;
    let node: Element | null = el;
    while (node.parentElement) {
      depth++;
      node = node.parentElement;
    }
    // Prefer elements with explicit width styles as likely source
    const hasExplicitWidth =
      style.width !== 'auto' && style.width !== '' && style.width !== '0px';
    const adjustedDepth = hasExplicitWidth ? depth - 0.5 : depth;

    if (adjustedDepth < bestDepth) {
      bestDepth = adjustedDepth;
      bestSource = el;
    }
  }

  const direction: 'left' | 'right' | 'both' =
    sawRightOverflow && sawLeftOverflow
      ? 'both'
      : sawLeftOverflow
        ? 'left'
        : 'right';

  const metadata: Record<string, unknown> = {
    overflowPx: Math.round(overflowPx * 100) / 100,
    scrollWidth: effectiveScrollWidth,
    viewportWidth: viewport.width,
    tolerancePx: TOLERANCE_PX,
    direction,
  };
  if (intentionalScroll) {
    metadata.intentionalScroll = true;
  }

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

/** Check if an element explicitly enables horizontal scrolling. */
function isHorizontalScrollable(style: { overflowX: string }): boolean {
  return style.overflowX === 'auto' || style.overflowX === 'scroll';
}
