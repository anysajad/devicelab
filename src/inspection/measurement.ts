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
