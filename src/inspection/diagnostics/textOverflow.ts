import type { Diagnostic, DiagnosticChecker } from '../types';
import {
  createElementReference,
  generateDiagnosticId,
  getOverflowMetrics,
  getStyle,
  hasEllipsisTruncation,
  hasTextContent,
  isHidden,
  isScrollable,
} from '../utils';

/** Subpixel/browser rounding tolerance in pixels. */
const TOLERANCE_PX = 2;

/** Maximum text overflow diagnostics to report. */
const CAP = 15;

/**
 * Detect likely unintended text overflow.
 *
 * Excludes legitimate intentional behavior:
 * - scrollable containers (overflow-x/y auto/scroll)
 * - explicit ellipsis/truncation
 * - display:none / visibility:hidden
 * - zero-sized containers
 * - elements with no meaningful direct text
 *
 * Distinguishes child-element overflow from actual text overflow by
 * requiring the element to contain direct text nodes.
 */
export const textOverflowChecker: DiagnosticChecker = (ctx) => {
  const { measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  for (const el of ctx.elements) {
    if (diagnostics.length >= CAP) break;

    const style = getStyle(el, measurements);
    if (isHidden(style)) continue;

    // Exclude scrollable containers (intentional scrolling)
    if (isScrollable(style)) continue;

    // Exclude explicit ellipsis truncation
    if (hasEllipsisTruncation(style)) continue;

    // Require meaningful text in the element
    if (!hasTextContent(el)) continue;
    if (!hasDirectTextContent(el)) continue;

    const metrics = getOverflowMetrics(el, measurements);

    // Check horizontal overflow
    const horizontalOverflow =
      metrics.clientWidth > 0 &&
      metrics.scrollWidth > metrics.clientWidth + TOLERANCE_PX;

    // Check vertical overflow
    const verticalOverflow =
      metrics.clientHeight > 0 &&
      metrics.scrollHeight > metrics.clientHeight + TOLERANCE_PX;

    if (!horizontalOverflow && !verticalOverflow) continue;

    const direction: 'horizontal' | 'vertical' = horizontalOverflow
      ? 'horizontal'
      : 'vertical';

    const element = createElementReference(el);
    const metadata: Record<string, unknown> = {
      direction,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      scrollHeight: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
      overflowPx:
        direction === 'horizontal'
          ? Math.round((metrics.scrollWidth - metrics.clientWidth) * 100) / 100
          : Math.round((metrics.scrollHeight - metrics.clientHeight) * 100) /
            100,
    };

    const id = generateDiagnosticId('text-overflow', element, metadata);

    const overflow =
      direction === 'horizontal'
        ? metrics.scrollWidth - metrics.clientWidth
        : metrics.scrollHeight - metrics.clientHeight;

    diagnostics.push({
      id,
      type: 'text-overflow',
      severity: 'warning',
      message: `Text overflows its container ${direction === 'horizontal' ? 'horizontally' : 'vertically'} by ~${Math.round(overflow)}px.`,
      element,
      metadata,
    });
  }

  return diagnostics;
};

/**
 * Check if an element has direct text content (text nodes that are
 * immediate children), distinguishing from child-element overflow.
 * This requires iterating the element's child nodes.
 */
function hasDirectTextContent(el: Element): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (!node) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim().length > 0) return true;
    }
  }
  return false;
}
