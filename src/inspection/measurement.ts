import type { ComputedStyleSnapshot, MeasurementAdapter } from './types';

/**
 * Production MeasurementAdapter that delegates to real browser DOM APIs.
 *
 * This adapter performs live layout reads. It is NOT used in tests —
 * tests provide a mock adapter with deterministic geometry.
 */
export const DOMMeasurementAdapter: MeasurementAdapter = {
  getElementRect(el: Element): DOMRect {
    return el.getBoundingClientRect();
  },

  getComputedStyle(el: Element): ComputedStyleSnapshot {
    const style = window.getComputedStyle(el);
    return {
      position: style.position,
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      display: style.display,
      visibility: style.visibility,
      zIndex: style.zIndex,
      width: style.width,
      height: style.height,
      pointerEvents: style.pointerEvents,
    };
  },

  getScrollWidth(el: Element): number {
    return el.scrollWidth;
  },

  getScrollHeight(el: Element): number {
    return el.scrollHeight;
  },

  getClientDimensions(el: Element): {
    clientWidth: number;
    clientHeight: number;
  } {
    return { clientWidth: el.clientWidth, clientHeight: el.clientHeight };
  },
};

/**
 * Wrap a MeasurementAdapter with per-element memoization.
 *
 * Checkers share a single context, and several walk overlapping ancestor
 * chains (e.g. off-viewport ancestor detection, clipping detection) and call
 * measurement methods repeatedly for the same elements. Caching reads per
 * element keeps the inspection linear-ish without changing semantics: each
 * underlying measurement is computed at most once per inspection.
 */
export function createCachedMeasurementAdapter(
  base: MeasurementAdapter
): MeasurementAdapter {
  const rectCache = new WeakMap<Element, DOMRect>();
  const styleCache = new WeakMap<Element, ComputedStyleSnapshot>();
  const scrollWidthCache = new WeakMap<Element, number>();
  const scrollHeightCache = new WeakMap<Element, number>();
  const clientCache = new WeakMap<
    Element,
    { clientWidth: number; clientHeight: number }
  >();

  return {
    getElementRect(el: Element): DOMRect {
      const cached = rectCache.get(el);
      if (cached) return cached;
      const rect = base.getElementRect(el);
      rectCache.set(el, rect);
      return rect;
    },

    getComputedStyle(el: Element): ComputedStyleSnapshot {
      const cached = styleCache.get(el);
      if (cached) return cached;
      const style = base.getComputedStyle(el);
      styleCache.set(el, style);
      return style;
    },

    getScrollWidth(el: Element): number {
      const cached = scrollWidthCache.get(el);
      if (cached !== undefined) return cached;
      const value = base.getScrollWidth(el);
      scrollWidthCache.set(el, value);
      return value;
    },

    getScrollHeight(el: Element): number {
      const cached = scrollHeightCache.get(el);
      if (cached !== undefined) return cached;
      const value = base.getScrollHeight(el);
      scrollHeightCache.set(el, value);
      return value;
    },

    getClientDimensions(el: Element): {
      clientWidth: number;
      clientHeight: number;
    } {
      const cached = clientCache.get(el);
      if (cached) return cached;
      const dims = base.getClientDimensions(el);
      clientCache.set(el, dims);
      return dims;
    },
  };
}
