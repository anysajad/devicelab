import type { Diagnostic, DiagnosticChecker } from '../types';
import type { ComputedStyleSnapshot } from '../types';
import {
  createElementReference,
  generateDiagnosticId,
  getElementRect,
  getStyle,
  hasInteractiveAncestor,
  hasZeroArea,
  isHidden,
  isInteractiveElement,
  isTinyElement,
} from '../utils';

/** Recommended minimum touch target size (WCAG 2.5.5, CSS px). */
const RECOMMENDED_MIN = 44;

/** Absolute minimum touch target size (WCAG 2.5.8, CSS px). */
const ABSOLUTE_MIN = 24;

/** Maximum touch-target diagnostics to report. */
const CAP = 20;

/**
 * Detect interactive elements with undersized touch targets.
 *
 * Per-target minimum size only — this does NOT assess spacing or adjacency
 * between targets (deliberately avoided to keep the check deterministic and
 * O(n)).
 *
 * Thresholds:
 * - At least one dimension below 24 CSS px → warning (fails WCAG 2.5.8).
 * - At least one dimension below 44 CSS px (but ≥ 24) → info (WCAG 2.5.5
 *   recommended, not strictly required).
 * - Both dimensions ≥ 44 CSS px → clean.
 *
 * Excludes: disabled/aria-disabled controls, hidden/aria-hidden/[hidden]
 * elements, zero/tiny geometry, and interactive elements nested inside
 * another interactive element (the outer target is the user-facing one).
 */
export const touchTargetChecker: DiagnosticChecker = (ctx) => {
  const { measurements } = ctx;
  const diagnostics: Diagnostic[] = [];

  for (const el of ctx.elements) {
    if (diagnostics.length >= CAP) break;

    // Cheap filter first — most of the DOM is not interactive.
    if (!isInteractiveElement(el)) continue;

    const style = getStyle(el, measurements);
    const rect = getElementRect(el, measurements);
    if (!shouldInspect(el, style, rect)) continue;

    const widthOk = rect.width >= RECOMMENDED_MIN;
    const heightOk = rect.height >= RECOMMENDED_MIN;
    if (widthOk && heightOk) continue;

    const belowAbsolute =
      rect.width < ABSOLUTE_MIN || rect.height < ABSOLUTE_MIN;

    const element = createElementReference(el);
    const metadata: Record<string, unknown> = {
      measuredWidth: roundTo2(rect.width),
      measuredHeight: roundTo2(rect.height),
      recommendedMin: RECOMMENDED_MIN,
      absoluteMin: ABSOLUTE_MIN,
    };

    const id = generateDiagnosticId('touch-target', element, metadata);

    const message = belowAbsolute
      ? `Interactive element is below the ${ABSOLUTE_MIN}px minimum touch target size (${Math.round(rect.width)}×${Math.round(rect.height)} CSS px).`
      : `Interactive element is below the ${RECOMMENDED_MIN}px recommended touch target size (${Math.round(rect.width)}×${Math.round(rect.height)} CSS px).`;

    diagnostics.push({
      id,
      type: 'touch-target',
      severity: belowAbsolute ? 'warning' : 'info',
      message,
      element,
      metadata,
    });
  }

  // If capped, add metadata about suppressed findings
  if (diagnostics.length >= CAP) {
    let additionalCount = 0;
    for (const el of ctx.elements) {
      if (!isInteractiveElement(el)) continue;
      const style = getStyle(el, measurements);
      const rect = getElementRect(el, measurements);
      if (!shouldInspect(el, style, rect)) continue;
      if (rect.width >= RECOMMENDED_MIN && rect.height >= RECOMMENDED_MIN) {
        continue;
      }
      additionalCount++;
    }
    if (additionalCount > CAP) {
      const suppressedCount = additionalCount - CAP;
      diagnostics.push({
        id: generateDiagnosticId('touch-target', undefined, {
          suppressed: suppressedCount,
        }),
        type: 'touch-target',
        severity: 'info',
        message: `${suppressedCount} additional undersized interactive element${suppressedCount !== 1 ? 's' : ''} not shown (cap reached).`,
        metadata: { suppressed: suppressedCount, cap: CAP },
      });
    }
  }

  return diagnostics;
};

/**
 * Shared exclusion logic used by both the main scan and the suppression pass.
 */
function shouldInspect(
  el: Element,
  style: ComputedStyleSnapshot,
  rect: DOMRect
): boolean {
  if (!isInteractiveElement(el)) return false;

  // Disabled controls cannot receive interaction.
  if (
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true'
  ) {
    return false;
  }

  // Not perceivable / not rendered.
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) {
    return false;
  }
  if (isHidden(style)) return false;

  // Degenerate or invisible geometry.
  if (hasZeroArea(rect) || isTinyElement(rect)) return false;

  // Nested interactive elements collapse to the outer target.
  if (hasInteractiveAncestor(el)) return false;

  return true;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
