import { describe, expect, it } from 'vitest';

import { getDeviceById } from '@/devices';
import type { DeviceDefinition } from '@/devices';
import {
  clampZoom,
  computeEffectiveZoom,
  computePreviewState,
  computeSafeArea,
  computeViewport,
  computeZoom,
  resolveOrientation,
  sanitizeUrl,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '../previewUtils';

const iphone15 = getDeviceById('iphone-15')!;
const desktop1080p = getDeviceById('desktop-1080p')!;
const iphoneSE = getDeviceById('iphone-se')!;

const customDevice: DeviceDefinition = {
  id: 'test-device',
  name: 'Test Device',
  manufacturer: 'Test',
  category: 'custom',
  viewport: { width: 500, height: 800 },
  devicePixelRatio: 2,
  safeArea: { top: 20, right: 10, bottom: 30, left: 10 },
  orientations: ['portrait', 'landscape'],
};

describe('computeViewport', () => {
  it('returns portrait dimensions for portrait orientation', () => {
    const vp = computeViewport(iphone15, 'portrait');
    expect(vp).toEqual({ width: 393, height: 852 });
  });

  it('swaps width and height for landscape orientation', () => {
    const vp = computeViewport(iphone15, 'landscape');
    expect(vp).toEqual({ width: 852, height: 393 });
  });

  it('returns landscape dimensions for a landscape-only device', () => {
    const vp = computeViewport(desktop1080p, 'landscape');
    expect(vp).toEqual({ width: 1920, height: 1080 });
  });

  it('uses custom device viewport', () => {
    const vp = computeViewport(customDevice, 'portrait');
    expect(vp).toEqual({ width: 500, height: 800 });
  });
});

describe('resolveOrientation', () => {
  it('returns requested orientation when supported', () => {
    expect(resolveOrientation(iphone15, 'landscape')).toBe('landscape');
    expect(resolveOrientation(iphone15, 'portrait')).toBe('portrait');
  });

  it('falls back to first supported orientation when unsupported', () => {
    // Desktop only supports landscape
    expect(resolveOrientation(desktop1080p, 'portrait')).toBe('landscape');
  });

  it('returns the first orientation as ultimate fallback', () => {
    const singleOrientation: DeviceDefinition = {
      ...customDevice,
      orientations: ['landscape'],
    };
    expect(resolveOrientation(singleOrientation, 'portrait')).toBe('landscape');
  });
});

describe('computeZoom', () => {
  it('scales to fit width when width is the constraint', () => {
    // 393×852 viewport in 400×900 container
    // Available: 368×868 → scaleX=0.936, scaleY=1.019 → min=0.936
    const zoom = computeZoom({ width: 393, height: 852 }, 400, 900);
    expect(zoom).toBeCloseTo(0.936, 2);
  });

  it('scales to fit height when height is the constraint', () => {
    // 393×852 viewport in 800×400 container
    // Available: 768×368 → scaleX=1.954, scaleY=0.432 → min=0.432
    const zoom = computeZoom({ width: 393, height: 852 }, 800, 400);
    expect(zoom).toBeCloseTo(0.432, 2);
  });

  it('caps at 1 when container is large enough', () => {
    const zoom = computeZoom({ width: 393, height: 852 }, 2000, 2000);
    expect(zoom).toBe(1);
  });

  it('returns 1 for zero-size viewport', () => {
    const zoom = computeZoom({ width: 0, height: 0 }, 800, 600);
    expect(zoom).toBe(1);
  });

  it('deducts container padding from available space', () => {
    // Exact fit without padding: 425×884 container for 393×852 viewport
    // With 32px padding: available = 393×852 → zoom = 1
    const zoomExact = computeZoom({ width: 393, height: 852 }, 425, 884);
    expect(zoomExact).toBe(1);

    // Without the extra 32px, zoom would exceed 1
    const zoomTight = computeZoom({ width: 393, height: 852 }, 424, 883);
    expect(zoomTight).toBeLessThan(1);
  });

  it('handles zero container dimensions', () => {
    const zoom = computeZoom({ width: 393, height: 852 }, 0, 0);
    expect(zoom).toBe(0);
  });
});

describe('computeSafeArea', () => {
  it('returns portrait insets for portrait orientation', () => {
    const sa = computeSafeArea(iphone15, 'portrait');
    expect(sa).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
  });

  it('transposes insets for landscape orientation', () => {
    const sa = computeSafeArea(iphone15, 'landscape');
    expect(sa).toEqual({ top: 0, right: 59, bottom: 0, left: 34 });
  });

  it('returns zero insets for devices without safe areas', () => {
    const sa = computeSafeArea(iphoneSE, 'portrait');
    expect(sa).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('returns zero insets for landscape on devices without safe areas', () => {
    const sa = computeSafeArea(iphoneSE, 'landscape');
    expect(sa).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('correctly transposes asymmetric insets', () => {
    const sa = computeSafeArea(customDevice, 'landscape');
    // portrait: top:20, right:10, bottom:30, left:10
    // landscape: top←left:10, right←top:20, bottom←right:10, left←bottom:30
    expect(sa).toEqual({ top: 10, right: 20, bottom: 10, left: 30 });
  });
});

describe('sanitizeUrl', () => {
  it('accepts https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('accepts http URLs', () => {
    expect(sanitizeUrl('http://localhost:5173')).toBe('http://localhost:5173/');
  });

  it('accepts localhost URLs without protocol', () => {
    expect(sanitizeUrl('localhost:5173')).toBe('https://localhost:5173/');
  });

  it('accepts protocol-relative URLs', () => {
    expect(sanitizeUrl('//example.com/path')).toBe('https://example.com/path');
  });

  it('returns about:blank for empty strings', () => {
    expect(sanitizeUrl('')).toBe('about:blank');
  });

  it('returns about:blank for whitespace-only strings', () => {
    expect(sanitizeUrl('   ')).toBe('about:blank');
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
  });

  it('rejects data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('about:blank');
  });

  it('rejects file: protocol', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('about:blank');
  });

  it('rejects vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:MsgBox(1)')).toBe('about:blank');
  });

  it('accepts URLs with paths and query strings', () => {
    expect(sanitizeUrl('https://example.com/path?q=1#hash')).toBe(
      'https://example.com/path?q=1#hash'
    );
  });
});

describe('computePreviewState', () => {
  it('computes full state from config and container size', () => {
    const state = computePreviewState(
      { url: 'https://example.com', device: iphone15, orientation: 'portrait' },
      800,
      600,
      'ready',
      null
    );

    expect(state.config.url).toBe('https://example.com');
    expect(state.config.device).toBe(iphone15);
    expect(state.config.orientation).toBe('portrait');
    expect(state.viewport).toEqual({ width: 393, height: 852 });
    expect(state.lifecycle).toBe('ready');
    expect(state.error).toBeNull();
    expect(state.zoom).toBeGreaterThan(0);
    expect(state.zoom).toBeLessThanOrEqual(1);
    expect(state.safeArea).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
  });

  it('resolves unsupported orientation', () => {
    const state = computePreviewState(
      {
        url: 'https://example.com',
        device: desktop1080p,
        orientation: 'portrait',
      },
      800,
      600,
      'idle',
      null
    );

    // Desktop only supports landscape
    expect(state.config.orientation).toBe('landscape');
    expect(state.viewport).toEqual({ width: 1920, height: 1080 });
  });

  it('reflects error state', () => {
    const state = computePreviewState(
      { url: 'https://bad.example', device: iphone15, orientation: 'portrait' },
      800,
      600,
      'error',
      'Failed to load'
    );

    expect(state.lifecycle).toBe('error');
    expect(state.error).toBe('Failed to load');
  });

  it('includes zoom mode and effective zoom in state', () => {
    const state = computePreviewState(
      { url: 'https://example.com', device: iphone15, orientation: 'portrait' },
      800,
      600,
      'ready',
      null,
      'manual',
      0.75
    );

    expect(state.zoomMode).toBe('manual');
    expect(state.manualZoom).toBe(0.75);
    expect(state.effectiveZoom).toBe(0.75);
  });
});

describe('clampZoom', () => {
  it('returns the value when within range', () => {
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2)).toBe(2);
  });

  it('clamps to minimum', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-1)).toBe(ZOOM_MIN);
  });

  it('clamps to maximum', () => {
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
  });
});

describe('computeEffectiveZoom', () => {
  it('returns auto-fit zoom in fit mode', () => {
    expect(computeEffectiveZoom('fit', 0.5, 1)).toBe(0.5);
    expect(computeEffectiveZoom('fit', 0.8, 2)).toBe(0.8);
  });

  it('returns clamped manual zoom in manual mode', () => {
    expect(computeEffectiveZoom('manual', 0.5, 0.75)).toBe(0.75);
    expect(computeEffectiveZoom('manual', 0.5, 0.1)).toBe(ZOOM_MIN);
    expect(computeEffectiveZoom('manual', 0.5, 5)).toBe(ZOOM_MAX);
  });
});

describe('zoom constants', () => {
  it('ZOOM_MIN is 0.25', () => {
    expect(ZOOM_MIN).toBe(0.25);
  });

  it('ZOOM_MAX is 3.0', () => {
    expect(ZOOM_MAX).toBe(3.0);
  });

  it('ZOOM_STEP is 0.1', () => {
    expect(ZOOM_STEP).toBe(0.1);
  });
});
