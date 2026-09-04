/**
 * Pure geometry helpers for the CSS-pixel rulers.
 *
 * Coordinate model (see architecture in README/plan):
 * - The rulers are drawn as siblings of the scaled preview container, aligned
 *   to the scaled footprint (viewport CSS dims × effectiveZoom).
 * - A tick's on-screen position is `cssValue * zoom` screen pixels.
 * - A tick's LABEL is its CSS-pixel value (`cssValue`), NOT its screen-pixel
 *   position. This is what makes measurements correct: the document's CSS
 *   pixel equals `screenPx / zoom`, so labeling in CSS pixels keeps ruler
 *   readouts stable under zoom and independent of devicePixelRatio.
 *
 * DPR never enters these calculations. It is only used when rasterizing the
 * canvas for crisp text, never for coordinate/value math.
 */
export interface RulerTick {
  /** On-screen position along the ruler axis, in screen pixels (zoom-scaled). */
  screenPos: number;
  /** CSS-pixel label value displayed at this tick. */
  cssValue: number;
}

export interface RulerTicks {
  readonly major: readonly RulerTick[];
  readonly minor: readonly RulerTick[];
}

/** "Nice" step sizes in CSS pixels, covering typical viewport scales. */
const MAJOR_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/**
 * Pick the smallest nice step (CSS pixels) that keeps the number of major
 * ticks within `maxMajorTicks` for a ruler spanning `cssLength` CSS pixels.
 */
export function computeRulerStep(
  cssLength: number,
  maxMajorTicks = 15
): number {
  if (cssLength <= 0 || maxMajorTicks <= 0) return 0;
  for (const step of MAJOR_STEPS) {
    if (cssLength / step <= maxMajorTicks) return step;
  }
  return MAJOR_STEPS[MAJOR_STEPS.length - 1]!;
}

/**
 * Generate major and minor ticks for a ruler of `cssLength` CSS pixels at the
 * given `zoom`. Labels always use CSS-pixel values; positions use screen px.
 */
export function computeRulerTicks(cssLength: number, zoom: number): RulerTicks {
  const EMPTY: RulerTicks = { major: [], minor: [] };
  if (cssLength <= 0 || zoom <= 0) return EMPTY;

  const step = computeRulerStep(cssLength);
  if (step <= 0) return EMPTY;

  const majorCount = Math.ceil(cssLength / step) + 1;
  const major: RulerTick[] = [];
  for (let i = 0; i < majorCount; i++) {
    const cssValue = i * step;
    major.push({ screenPos: cssValue * zoom, cssValue });
  }

  // Subdivide each major interval into 5 unlabeled minor ticks.
  const minorDiv = 5;
  const minorStep = step / minorDiv;
  const minor: RulerTick[] = [];
  const totalMinor = majorCount * minorDiv;
  for (let i = 1; i < totalMinor; i++) {
    if (i % minorDiv === 0) continue; // coincides with a major tick
    const cssValue = i * minorStep;
    minor.push({ screenPos: cssValue * zoom, cssValue });
  }

  return { major, minor };
}
