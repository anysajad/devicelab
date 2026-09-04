import { describe, expect, it } from 'vitest';

import { computeRulerStep, computeRulerTicks } from '../viewTools/rulers';

describe('computeRulerStep', () => {
  it('returns 0 for non-positive length', () => {
    expect(computeRulerStep(0)).toBe(0);
    expect(computeRulerStep(-5)).toBe(0);
  });

  it('returns a nice step that keeps ticks within the max count', () => {
    const step393 = computeRulerStep(393);
    // ~8 majors for a phone-width viewport
    expect(step393).toBe(50);
    // A tall viewport uses a coarser step
    expect(computeRulerStep(852)).toBe(100);
    // A very small viewport → small step
    expect(computeRulerStep(40)).toBe(5);
    // Guard invariant: actual major count respects the configured cap.
    expect(Math.ceil(393 / step393) + 1).toBeLessThanOrEqual(15);
  });

  it('respects an explicit max tick count', () => {
    // With only 3 majors allowed, 393 needs a 200px step
    expect(computeRulerStep(393, 3)).toBe(200);
  });
});

describe('computeRulerTicks', () => {
  it('returns empty ticks for non-positive length or zoom', () => {
    expect(computeRulerTicks(0, 1)).toEqual({ major: [], minor: [] });
    expect(computeRulerTicks(393, 0)).toEqual({ major: [], minor: [] });
    expect(computeRulerTicks(-1, 2)).toEqual({ major: [], minor: [] });
  });

  it('labels ticks in CSS pixels, independent of zoom', () => {
    const atZoom1 = computeRulerTicks(393, 1);
    const atZoomHalf = computeRulerTicks(393, 0.5);

    // The CSS-pixel label values are identical regardless of zoom.
    const labelsAt1 = atZoom1.major.map((t) => t.cssValue);
    const labelsAtHalf = atZoomHalf.major.map((t) => t.cssValue);
    expect(labelsAt1).toEqual(labelsAtHalf);

    // Labels start at 0 and are clean multiples of the chosen step.
    const step = computeRulerStep(393);
    expect(atZoom1.major[0]!.cssValue).toBe(0);
    for (const tick of atZoom1.major) {
      expect(Number.isInteger(tick.cssValue / step)).toBe(true);
    }
  });

  it('scales screen positions linearly with zoom', () => {
    const atZoom1 = computeRulerTicks(393, 1);
    const atZoom2 = computeRulerTicks(393, 2);

    expect(atZoom1.major.length).toBeGreaterThan(0);
    expect(atZoom2.major.length).toBe(atZoom1.major.length);
    for (let i = 0; i < atZoom1.major.length; i++) {
      // Doubling zoom doubles the on-screen position but NOT the label.
      expect(atZoom2!.major[i]!.screenPos).toBeCloseTo(
        atZoom1.major[i]!.screenPos * 2
      );
      expect(atZoom2.major[i]!.cssValue).toBe(atZoom1.major[i]!.cssValue);
    }
  });

  it('positions the first major tick at the origin (0,0)', () => {
    const top = computeRulerTicks(393, 0.8);
    expect(top.major[0]!.screenPos).toBeCloseTo(0);
    expect(top.major[0]!.cssValue).toBe(0);
  });

  it('does not duplicate major ticks among minor ticks', () => {
    const ticks = computeRulerTicks(393, 1);
    const majorPositions = new Set(
      ticks.major.map((t) => Math.round(t.screenPos))
    );
    for (const minor of ticks.minor) {
      expect(majorPositions.has(Math.round(minor.screenPos))).toBe(false);
    }
  });

  it('produces more minor ticks than major ticks', () => {
    const ticks = computeRulerTicks(852, 1);
    expect(ticks.minor.length).toBeGreaterThan(ticks.major.length);
    expect(ticks.minor.length).toBeGreaterThan(0);
  });

  it('handles large custom viewports without runaway tick counts', () => {
    // 4000 CSS px at zoom 1 → the nice step keeps majors bounded.
    const ticks = computeRulerTicks(4000, 1);
    expect(ticks.major.length).toBeLessThanOrEqual(41);
  });
});
