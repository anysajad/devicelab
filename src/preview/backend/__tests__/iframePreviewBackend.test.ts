import { describe, expect, it } from 'vitest';

import { getDeviceById } from '@/devices';
import type { DeviceDefinition } from '@/devices';
import type { PreviewConfig, PreviewState } from '../../types';
import {
  createIframePreviewBackend,
  getIframeInspectionAccess,
} from '../iframePreviewBackend';
import type { PreviewBackend } from '../types';

const iphone15 = getDeviceById('iphone-15')!;
const desktop1080p = getDeviceById('desktop-1080p')!;

function makeConfig(url: string, device: DeviceDefinition): PreviewConfig {
  return { url, device, orientation: 'portrait' };
}

function readyDocument(): Document {
  const doc = document.implementation.createHTMLDocument('preview');
  Object.defineProperty(doc, 'readyState', {
    value: 'complete',
    configurable: true,
  });
  return doc;
}

describe('createIframePreviewBackend (contract)', () => {
  it('exposes the full abstract backend surface and hides the iframe engine', () => {
    const backend = createIframePreviewBackend();
    expect(backend.kind).toBe('iframe');
    for (const method of [
      'load',
      'setContainerSize',
      'reload',
      'destroy',
      'getState',
      'subscribe',
      'getSurface',
      'getInspectionAccess',
      'getScreenshotSource',
      'setZoom',
      'zoomIn',
      'zoomOut',
      'setZoomMode',
    ]) {
      expect(
        typeof (backend as unknown as Record<string, unknown>)[method]
      ).toBe('function');
    }
    // The UI-facing backend must never expose the iframe-specific detail.
    expect(
      (backend as unknown as Record<string, unknown>).getIframe
    ).toBeUndefined();
  });

  it('starts idle with no surface', () => {
    const backend = createIframePreviewBackend();
    expect(backend.getState().lifecycle).toBe('idle');
    expect(backend.getSurface()).toBeNull();
    expect(backend.getInspectionAccess().status).toBe('pending');
    expect(backend.getScreenshotSource()).not.toBeNull();
  });

  it('load() creates a surface and drives lifecycle to loading', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));

    expect(backend.getState().lifecycle).toBe('loading');
    expect(backend.getState().config.url).toBe('https://example.com');
    const surface = backend.getSurface();
    expect(surface).not.toBeNull();
    expect(surface!.tagName).toBe('IFRAME');
  });

  it('computes the device viewport', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));
    expect(backend.getState().viewport.width).toBe(393);
    expect(backend.getState().viewport.height).toBe(852);
  });

  it('subscribe() notifies on state changes and unsubscribing stops it', () => {
    const backend = createIframePreviewBackend();
    const states: PreviewState[] = [];
    const unsub = backend.subscribe((s) => states.push(s));

    backend.load(makeConfig('https://example.com', iphone15));
    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(states.at(-1)!.lifecycle).toBe('loading');

    unsub();
    backend.reload();
    const countAfterUnsub = states.length;
    backend.load(makeConfig('https://second.com', desktop1080p));
    // No further notifications after unsubscribing.
    expect(states.length).toBe(countAfterUnsub);
  });

  it('reload() cycles back to loading', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));
    backend.reload();
    expect(backend.getState().lifecycle).toBe('loading');
  });

  it('setContainerSize() recomputes fit zoom', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));
    const before = backend.getState().zoom;
    backend.setContainerSize(1200, 800);
    const after = backend.getState().zoom;
    expect(after).not.toBeCloseTo(before, 4);
  });

  it('setZoom/zoomIn/zoomOut switch to manual and setZoomMode restores fit', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));

    backend.setZoom(0.75);
    expect(backend.getState().zoomMode).toBe('manual');
    expect(backend.getState().effectiveZoom).toBe(0.75);

    backend.setZoomMode('fit');
    expect(backend.getState().zoomMode).toBe('fit');

    backend.zoomIn();
    expect(backend.getState().zoomMode).toBe('manual');
    expect(backend.getState().effectiveZoom).toBeGreaterThan(0.75);

    backend.zoomOut();
    expect(backend.getState().effectiveZoom).toBe(0.75);
  });

  it('getScreenshotSource() returns the rendered surface and device name', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));

    const source = backend.getScreenshotSource();
    expect(source).not.toBeNull();
    expect(source!.iframe).toBe(backend.getSurface());
    expect(source!.deviceName).toBe(iphone15.name);
  });

  it('destroy() removes the surface, resets to idle, and re-arms for reload', () => {
    const backend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));
    expect(backend.getSurface()).not.toBeNull();

    backend.destroy();
    expect(backend.getSurface()).toBeNull();
    expect(backend.getState().lifecycle).toBe('idle');
    expect(backend.getInspectionAccess().status).toBe('pending');

    // StrictMode re-arm: a load after destroy must start fresh (the remounted
    // component re-subscribes, and load() must not be a silent no-op).
    const unsub = backend.subscribe(() => {});
    backend.load(makeConfig('https://second.com', desktop1080p));
    expect(backend.getState().lifecycle).toBe('loading');
    expect(backend.getState().config.url).toBe('https://second.com');
    expect(backend.getSurface()).not.toBeNull();
    unsub();
  });

  it('returns a valid inspection access status after load without throwing', () => {
    const backend = createIframePreviewBackend();
    expect(backend.getInspectionAccess().status).toBe('pending');
    backend.load(makeConfig('https://example.com', iphone15));
    const access = backend.getInspectionAccess();
    expect(['pending', 'inaccessible', 'available']).toContain(access.status);
  });

  it('keeps multiple backends fully independent', () => {
    const a = createIframePreviewBackend();
    const b = createIframePreviewBackend();

    a.load(makeConfig('https://a.example.com', iphone15));
    b.load(makeConfig('https://b.example.com', desktop1080p));

    expect(a.getState().config.url).toBe('https://a.example.com');
    expect(b.getState().config.url).toBe('https://b.example.com');
    expect(a.getSurface()).not.toBe(b.getSurface());
    expect(a.getState().viewport).not.toEqual(b.getState().viewport);

    a.destroy();
    expect(a.getSurface()).toBeNull();
    expect(b.getSurface()).not.toBeNull();
    expect(b.getState().lifecycle).toBe('loading');
  });

  it('the backend still satisfies the contract after a full destroy/reload cycle', () => {
    const backend: PreviewBackend = createIframePreviewBackend();
    backend.load(makeConfig('https://example.com', iphone15));
    backend.destroy();
    backend.load(makeConfig('https://second.com', desktop1080p));
    // Contract methods remain callable post re-arm.
    backend.setZoom(1);
    backend.setContainerSize(500, 500);
    expect(backend.getState().zoomMode).toBe('manual');
    expect(backend.getSurface()).not.toBeNull();
  });
});

describe('getIframeInspectionAccess', () => {
  it('returns pending for a missing iframe', () => {
    expect(getIframeInspectionAccess(null).status).toBe('pending');
  });

  it('returns inaccessible cross-origin when access throws', () => {
    const el = document.createElement('iframe');
    Object.defineProperty(el, 'contentDocument', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
      configurable: true,
    });
    expect(getIframeInspectionAccess(el)).toEqual({
      status: 'inaccessible',
      reason: 'cross-origin',
    });
  });

  it('returns cross-origin for a null document behind a different-origin src', () => {
    const el = document.createElement('iframe');
    el.src = 'http://cross-origin.example/fixtures/clean.html';
    Object.defineProperty(el, 'contentDocument', {
      value: null,
      configurable: true,
    });
    expect(getIframeInspectionAccess(el)).toEqual({
      status: 'inaccessible',
      reason: 'cross-origin',
    });
  });

  it('returns contentDocument-unavailable for a null document on about:blank', () => {
    const el = document.createElement('iframe');
    el.src = 'about:blank';
    Object.defineProperty(el, 'contentDocument', {
      value: null,
      configurable: true,
    });
    expect(getIframeInspectionAccess(el)).toEqual({
      status: 'inaccessible',
      reason: 'contentDocument-unavailable',
    });
  });

  it('returns pending while the document is not ready', () => {
    const el = document.createElement('iframe');
    const doc = readyDocument();
    Object.defineProperty(doc, 'readyState', {
      value: 'loading',
      configurable: true,
    });
    Object.defineProperty(el, 'contentDocument', {
      value: doc,
      configurable: true,
    });
    expect(getIframeInspectionAccess(el)).toEqual({ status: 'pending' });
  });

  it('returns available with the ready document', () => {
    const el = document.createElement('iframe');
    const doc = readyDocument();
    Object.defineProperty(el, 'contentDocument', {
      value: doc,
      configurable: true,
    });
    expect(getIframeInspectionAccess(el)).toEqual({
      status: 'available',
      document: doc,
    });
  });
});
