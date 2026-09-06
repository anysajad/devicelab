import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getDeviceById } from '@/devices';
import { usePreview } from '../usePreview';

const iphone15 = getDeviceById('iphone-15')!;
const desktop1080p = getDeviceById('desktop-1080p')!;

// jsdom does not implement ResizeObserver — provide a minimal mock.
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;
}

describe('usePreview', () => {
  it('returns initial idle state', () => {
    const { result } = renderHook(() => usePreview());
    expect(result.current.state.lifecycle).toBe('idle');
  });

  it('provides a backend satisfying the abstract contract', () => {
    const { result } = renderHook(() => usePreview());
    expect(typeof result.current.load).toBe('function');
    expect(typeof result.current.setDevice).toBe('function');
    expect(typeof result.current.setOrientation).toBe('function');
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.setZoom).toBe('function');
    expect(typeof result.current.zoomIn).toBe('function');
    expect(typeof result.current.zoomOut).toBe('function');
    expect(typeof result.current.fitToContainer).toBe('function');
    expect(result.current.backend).toBeDefined();
    // The hook returns the abstract backend surface — the iframe adapter is
    // behind the contract, not exposed to the UI.
    expect(result.current.backend.kind).toBe('iframe');
    expect(typeof result.current.backend.getSurface).toBe('function');
    expect(typeof result.current.backend.getInspectionAccess).toBe('function');
    expect(typeof result.current.backend.getScreenshotSource).toBe('function');
    expect(typeof result.current.backend.subscribe).toBe('function');
    expect(result.current.backend.getSurface()).toBeNull();
    expect(result.current.backend.getInspectionAccess().status).toBe('pending');
  });

  it('load() transitions to loading state', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    expect(result.current.state.lifecycle).toBe('loading');
    expect(result.current.state.config.url).toBe('https://example.com');
    expect(result.current.state.config.device).toBe(iphone15);
  });

  it('setDevice() updates the device and recomputes viewport', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    const initialViewport = result.current.state.viewport;

    act(() => {
      result.current.setDevice(desktop1080p);
    });

    expect(result.current.state.config.device).toBe(desktop1080p);
    // Viewport should change (different device dimensions)
    expect(result.current.state.viewport).not.toEqual(initialViewport);
  });

  it('setOrientation() updates orientation', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    expect(result.current.state.config.orientation).toBe('portrait');

    act(() => {
      result.current.setOrientation('landscape');
    });

    expect(result.current.state.config.orientation).toBe('landscape');
    // Viewport should swap for landscape
    expect(result.current.state.viewport.width).toBe(852);
    expect(result.current.state.viewport.height).toBe(393);
  });

  it('setOrientation() falls back for unsupported orientation', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', desktop1080p);
    });

    // Desktop only supports landscape; portrait should resolve to landscape
    act(() => {
      result.current.setOrientation('portrait');
    });

    expect(result.current.state.config.orientation).toBe('landscape');
  });

  it('reload() sets lifecycle to loading', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    act(() => {
      result.current.reload();
    });

    expect(result.current.state.lifecycle).toBe('loading');
  });

  it('containerRef is initially null', () => {
    const { result } = renderHook(() => usePreview());
    expect(result.current.containerRef.current).toBeNull();
  });

  it('provides safe-area metadata', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    // iPhone 15 has safe-area insets
    expect(result.current.state.safeArea.top).toBe(59);
    expect(result.current.state.safeArea.bottom).toBe(34);
  });

  it('provides zoom metadata', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    // Default container size should produce a zoom ≤ 1
    expect(result.current.state.zoom).toBeGreaterThan(0);
    expect(result.current.state.zoom).toBeLessThanOrEqual(1);
    expect(result.current.state.zoomMode).toBe('fit');
    expect(result.current.state.effectiveZoom).toBe(result.current.state.zoom);
  });

  it('setZoom() switches to manual mode', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    act(() => {
      result.current.setZoom(0.75);
    });

    expect(result.current.state.zoomMode).toBe('manual');
    expect(result.current.state.effectiveZoom).toBe(0.75);
  });

  it('fitToContainer() switches to fit mode', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://example.com', iphone15);
    });

    act(() => {
      result.current.setZoom(0.75);
    });
    expect(result.current.state.zoomMode).toBe('manual');

    act(() => {
      result.current.fitToContainer();
    });
    expect(result.current.state.zoomMode).toBe('fit');
  });

  it('cleans up on unmount without errors', () => {
    const { unmount } = renderHook(() => usePreview());
    expect(() => unmount()).not.toThrow();
  });

  it('handles multiple rapid load() calls', () => {
    const { result } = renderHook(() => usePreview());

    act(() => {
      result.current.load('https://first.com', iphone15);
      result.current.load('https://second.com', desktop1080p);
    });

    // Should reflect the last call
    expect(result.current.state.config.url).toBe('https://second.com');
    expect(result.current.state.config.device).toBe(desktop1080p);
  });
});
