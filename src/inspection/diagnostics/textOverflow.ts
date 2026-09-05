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
 * Refinements:
 * - Vertical overflow is only reported when the container has an explicit
 *   (non-auto) height; with height:auto the box simply grows and nothing is
 *   clipped.
 * - Vertical overflow clipped by overflow-y:hidden/clip is downgraded to
 *   info (deliberate clipping) instead of a warning.
 * - Horizontal overflow carries white-space context: with wrapping whitespace
 *   the "overflow" may resolve by wrapping, so the finding is marked
 *   uncertain.
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

    // Vertical overflow only matters when the box has an explicit height —
    // with height:auto the container grows and nothing is clipped.
    const hasExplicitHeight =
      style.height !== 'auto' && style.height !== '' && style.height !== '0px';
    const verticalOverflow =
      hasExplicitHeight &&
      metrics.clientHeight > 0 &&
      metrics.scrollHeight > metrics.clientHeight + TOLERANCE_PX;

    if (!horizontalOverflow && !verticalOverflow) continue;

    const direction: 'horizontal' | 'vertical' = horizontalOverflow
      ? 'horizontal'
      : 'vertical';

    // white-space: nowrap/pre present the content as a single unbreakable
    // run; other values allow wrapping, so horizontal overflow is uncertain.
    const isNowrap =
      style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre';

    // Vertical overflow clipped by overflow-y:hidden/clip is deliberate.
    const verticalClipped =
      verticalOverflow &&
      (style.overflowY === 'hidden' || style.overflowY === 'clip');

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
      whiteSpace: style.whiteSpace,
      uncertain: direction === 'horizontal' && !isNowrap,
      clipped: verticalClipped,
    };

    const id = generateDiagnosticId('text-overflow', element, metadata);

    const overflow =
      direction === 'horizontal'
        ? metrics.scrollWidth - metrics.clientWidth
        : metrics.scrollHeight - metrics.clientHeight;

    const baseMessage = `Text overflows its container ${direction === 'horizontal' ? 'horizontally' : 'vertically'} by ~${Math.round(overflow)}px.`;
    let message = baseMessage;
    if (direction === 'horizontal' && !isNowrap) {
      message = `${baseMessage} Text wraps by default (white-space: ${style.whiteSpace}) — overflow may be reflowed rather than clipped.`;
    } else if (verticalClipped) {
      message = `${baseMessage} Content is clipped by the container.`;
    }

    const severity: Diagnostic['severity'] = verticalClipped
      ? 'info'
      : 'warning';

    diagnostics.push({
      id,
      type: 'text-overflow',
      severity,
      message,
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
