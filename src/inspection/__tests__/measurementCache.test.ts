import { describe, expect, it, vi } from 'vitest';

import { createCachedMeasurementAdapter } from '../measurement';
import { createMockMeasurementAdapter } from './helpers';

describe('createCachedMeasurementAdapter', () => {
  it('delegates to the base adapter', () => {
    const el = document.createElement('div');
    const map = new Map([
      [
        el,
        {
          rect: { x: 5, y: 10, width: 100, height: 50 },
          scrollWidth: 300,
          scrollHeight: 200,
          clientWidth: 100,
          clientHeight: 50,
          style: { position: 'fixed' },
        },
      ],
    ]);
    const cached = createCachedMeasurementAdapter(
      createMockMeasurementAdapter(map)
    );

    expect(cached.getElementRect(el)).toMatchObject({
      x: 5,
      y: 10,
      width: 100,
      height: 50,
    });
    expect(cached.getScrollWidth(el)).toBe(300);
    expect(cached.getScrollHeight(el)).toBe(200);
    expect(cached.getClientDimensions(el)).toEqual({
      clientWidth: 100,
      clientHeight: 50,
    });
    expect(cached.getComputedStyle(el).position).toBe('fixed');
  });

  it('memoizes per-element reads so the base adapter is called once', () => {
    const el = document.createElement('div');
    const base = createMockMeasurementAdapter(new Map());
    const rectSpy = vi.spyOn(base, 'getElementRect');
    const styleSpy = vi.spyOn(base, 'getComputedStyle');
    const scrollWidthSpy = vi.spyOn(base, 'getScrollWidth');
    const scrollHeightSpy = vi.spyOn(base, 'getScrollHeight');
    const clientSpy = vi.spyOn(base, 'getClientDimensions');

    const cached = createCachedMeasurementAdapter(base);
    cached.getElementRect(el);
    cached.getElementRect(el);
    cached.getComputedStyle(el);
    cached.getComputedStyle(el);
    cached.getScrollWidth(el);
    cached.getScrollWidth(el);
    cached.getScrollHeight(el);
    cached.getScrollHeight(el);
    cached.getClientDimensions(el);
    cached.getClientDimensions(el);

    expect(rectSpy).toHaveBeenCalledTimes(1);
    expect(styleSpy).toHaveBeenCalledTimes(1);
    expect(scrollWidthSpy).toHaveBeenCalledTimes(1);
    expect(scrollHeightSpy).toHaveBeenCalledTimes(1);
    expect(clientSpy).toHaveBeenCalledTimes(1);
  });

  it('memoizes zero-valued reads too', () => {
    const el = document.createElement('div');
    const base = createMockMeasurementAdapter(new Map());
    // No measurements registered → scrollWidth resolves to 0
    const scrollWidthSpy = vi.spyOn(base, 'getScrollWidth');
    const scrollHeightSpy = vi.spyOn(base, 'getScrollHeight');

    const cached = createCachedMeasurementAdapter(base);
    expect(cached.getScrollWidth(el)).toBe(0);
    expect(cached.getScrollHeight(el)).toBe(0);
    expect(cached.getScrollWidth(el)).toBe(0);
    expect(cached.getScrollHeight(el)).toBe(0);

    expect(scrollWidthSpy).toHaveBeenCalledTimes(1);
    expect(scrollHeightSpy).toHaveBeenCalledTimes(1);
  });
});
