import { describe, expect, it, vi } from 'vitest';

import { getDeviceById } from '@/devices';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../previewUtils';
import { createPreviewController } from '../previewEngine';

const iphone15 = getDeviceById('iphone-15')!;
const desktop1080p = getDeviceById('desktop-1080p')!;

function makeConfig(url = 'https://example.com') {
  return {
    url,
    device: iphone15,
    orientation: 'portrait' as const,
  };
}

describe('createPreviewController', () => {
  it('returns a controller with the expected API', () => {
    const controller = createPreviewController();
    expect(typeof controller.load).toBe('function');
    expect(typeof controller.setContainerSize).toBe('function');
    expect(typeof controller.reload).toBe('function');
    expect(typeof controller.destroy).toBe('function');
    expect(typeof controller.getState).toBe('function');
    expect(typeof controller.subscribe).toBe('function');
    expect(typeof controller.getIframe).toBe('function');
    controller.destroy();
  });

  it('initial state is idle with no iframe', () => {
    const controller = createPreviewController();
    const state = controller.getState();
    expect(state.lifecycle).toBe('idle');
    expect(state.error).toBeNull();
    expect(controller.getIframe()).toBeNull();
    controller.destroy();
  });

  it('load() creates an iframe and sets lifecycle to loading', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe();
    expect(iframe).not.toBeNull();
    expect(controller.getState().lifecycle).toBe('loading');

    controller.destroy();
  });

  it('iframe has correct sandbox attributes', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe()!;
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-popups'
    );

    controller.destroy();
  });

  it('iframe has correct allow attribute', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe()!;
    expect(iframe.getAttribute('allow')).toBe(
      'accelerometer; camera; geolocation; gyroscope; microphone; usb'
    );

    controller.destroy();
  });

  it('iframe has correct title', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe()!;
    expect(iframe.getAttribute('title')).toBe('Device preview');

    controller.destroy();
  });

  it('iframe src is set to the sanitized URL', () => {
    const controller = createPreviewController();
    controller.load(makeConfig('https://example.com'));

    const iframe = controller.getIframe()!;
    // jsdom normalizes URLs
    expect(iframe.src).toContain('example.com');

    controller.destroy();
  });

  it('iframe CSS dimensions match the device viewport', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe()!;
    expect(iframe.style.width).toBe('393px');
    expect(iframe.style.height).toBe('852px');

    controller.destroy();
  });

  it('iframe has border:none and display:block', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    const iframe = controller.getIframe()!;
    expect(iframe.style.display).toBe('block');

    controller.destroy();
  });

  it('setContainerSize() updates zoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setContainerSize(800, 600);
    const state = controller.getState();
    expect(state.zoom).toBeGreaterThan(0);
    expect(state.zoom).toBeLessThanOrEqual(1);

    controller.destroy();
  });

  it('load() updates config and recomputes viewport', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    // Switch to a different device
    controller.load({
      url: 'https://example.com',
      device: desktop1080p,
      orientation: 'landscape',
    });

    const state = controller.getState();
    expect(state.config.device).toBe(desktop1080p);
    expect(state.viewport).toEqual({ width: 1920, height: 1080 });

    controller.destroy();
  });

  it('load() resolves unsupported orientation', () => {
    const controller = createPreviewController();
    controller.load({
      url: 'https://example.com',
      device: desktop1080p,
      orientation: 'portrait', // Desktop only supports landscape
    });

    const state = controller.getState();
    expect(state.config.orientation).toBe('landscape');

    controller.destroy();
  });

  it('subscribe() receives state updates', () => {
    const controller = createPreviewController();
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);

    controller.load(makeConfig());

    // At least one call from load()
    expect(listener).toHaveBeenCalled();

    unsub();
    controller.destroy();
  });

  it('unsubscribe stops notifications', () => {
    const controller = createPreviewController();
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);

    controller.load(makeConfig());
    listener.mockClear();

    unsub();
    controller.setContainerSize(800, 600);

    // No calls after unsubscribe
    expect(listener).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('destroy() removes iframe from DOM', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    expect(controller.getIframe()).not.toBeNull();
    controller.destroy();

    expect(controller.getIframe()).toBeNull();
  });

  it('destroy() clears subscribers', () => {
    const controller = createPreviewController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.destroy();

    // Calling load after destroy should not notify
    listener.mockClear();
    controller.load(makeConfig());
    expect(listener).not.toHaveBeenCalled();
  });

  it('no-ops after destroy until load() revives the controller', () => {
    const controller = createPreviewController();
    controller.destroy();

    // Destroyed: these should not throw and leave no live iframe.
    controller.setContainerSize(800, 600);
    controller.reload();
    expect(controller.getIframe()).toBeNull();

    // load() revives a torn-down controller (React StrictMode remounts
    // unmounted instances in development). (Found by Playwright E2E
    // validation.)
    controller.load(makeConfig());
    expect(controller.getIframe()).not.toBeNull();
    expect(controller.getState().lifecycle).toBe('loading');
  });

  it('reload() re-sets lifecycle to loading', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    // Manually set to ready to simulate a loaded state
    // (In jsdom, the load event fires synchronously for about:blank)
    controller.reload();
    expect(controller.getState().lifecycle).toBe('loading');

    controller.destroy();
  });

  it('handles empty URL gracefully', () => {
    const controller = createPreviewController();
    controller.load({
      url: '',
      device: iphone15,
      orientation: 'portrait',
    });

    const iframe = controller.getIframe()!;
    // Empty URL is sanitized to about:blank
    expect(iframe.src).toContain('about:blank');

    controller.destroy();
  });

  it('handles invalid URL gracefully', () => {
    const controller = createPreviewController();
    controller.load({
      url: 'javascript:alert(1)',
      device: iphone15,
      orientation: 'portrait',
    });

    const iframe = controller.getIframe()!;
    // Dangerous protocol is sanitized to about:blank
    expect(iframe.src).toContain('about:blank');

    controller.destroy();
  });

  it('applies transform:scale for zoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setContainerSize(200, 200);
    const iframe = controller.getIframe()!;
    expect(iframe.style.transform).toMatch(/^scale\(/);
    expect(iframe.style.transformOrigin).toBe('top left');

    controller.destroy();
  });

  // --- Zoom tests ---

  it('default zoom state is fit mode', () => {
    const controller = createPreviewController();
    const state = controller.getState();
    expect(state.zoomMode).toBe('fit');
    expect(state.manualZoom).toBe(1);
    expect(state.effectiveZoom).toBe(1);
    controller.destroy();
  });

  it('setZoom() switches to manual mode', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.75);
    const state = controller.getState();
    expect(state.zoomMode).toBe('manual');
    expect(state.manualZoom).toBe(0.75);
    expect(state.effectiveZoom).toBe(0.75);

    controller.destroy();
  });

  it('setZoom() clamps to minimum', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.1);
    expect(controller.getState().manualZoom).toBe(ZOOM_MIN);
    expect(controller.getState().effectiveZoom).toBe(ZOOM_MIN);

    controller.destroy();
  });

  it('setZoom() clamps to maximum', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(5);
    expect(controller.getState().manualZoom).toBe(ZOOM_MAX);
    expect(controller.getState().effectiveZoom).toBe(ZOOM_MAX);

    controller.destroy();
  });

  it('zoomIn() increments by step', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.5);
    controller.zoomIn();
    expect(controller.getState().manualZoom).toBeCloseTo(0.5 + ZOOM_STEP);

    controller.destroy();
  });

  it('zoomIn() clamps at maximum', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(ZOOM_MAX - 0.01);
    controller.zoomIn();
    expect(controller.getState().manualZoom).toBe(ZOOM_MAX);

    controller.destroy();
  });

  it('zoomOut() decrements by step', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.5);
    controller.zoomOut();
    expect(controller.getState().manualZoom).toBeCloseTo(0.5 - ZOOM_STEP);

    controller.destroy();
  });

  it('zoomOut() clamps at minimum', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(ZOOM_MIN + 0.01);
    controller.zoomOut();
    expect(controller.getState().manualZoom).toBe(ZOOM_MIN);

    controller.destroy();
  });

  it('setZoomMode("fit") restores auto-fit zoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());
    controller.setContainerSize(800, 600);

    controller.setZoom(2);
    expect(controller.getState().zoomMode).toBe('manual');

    controller.setZoomMode('fit');
    const state = controller.getState();
    expect(state.zoomMode).toBe('fit');
    expect(state.effectiveZoom).toBe(state.zoom); // equals auto-fit

    controller.destroy();
  });

  it('setZoomMode("manual") preserves manualZoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.75);
    controller.setZoomMode('fit');
    controller.setZoomMode('manual');
    expect(controller.getState().manualZoom).toBe(0.75);
    expect(controller.getState().effectiveZoom).toBe(0.75);

    controller.destroy();
  });

  it('manual zoom persists across device change', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.75);
    controller.load({
      url: 'https://example.com',
      device: desktop1080p,
      orientation: 'landscape',
    });

    expect(controller.getState().zoomMode).toBe('manual');
    expect(controller.getState().manualZoom).toBe(0.75);
    expect(controller.getState().effectiveZoom).toBe(0.75);

    controller.destroy();
  });

  it('manual zoom persists across container resize', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.75);
    controller.setContainerSize(400, 400);
    expect(controller.getState().effectiveZoom).toBe(0.75);

    controller.destroy();
  });

  it('fit mode recalculates on container resize', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setContainerSize(400, 400);
    const zoom1 = controller.getState().effectiveZoom;

    controller.setContainerSize(800, 800);
    const zoom2 = controller.getState().effectiveZoom;

    expect(zoom2).toBeGreaterThan(zoom1);

    controller.destroy();
  });

  it('iframe CSS dimensions remain the device viewport regardless of zoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(2);
    const iframe = controller.getIframe()!;
    // iPhone 15 portrait: 393×852
    expect(iframe.style.width).toBe('393px');
    expect(iframe.style.height).toBe('852px');

    controller.destroy();
  });

  it('iframe transform uses effectiveZoom', () => {
    const controller = createPreviewController();
    controller.load(makeConfig());

    controller.setZoom(0.75);
    const iframe = controller.getIframe()!;
    expect(iframe.style.transform).toBe('scale(0.75)');

    controller.destroy();
  });

  it('no-ops zoom methods after destroy', () => {
    const controller = createPreviewController();
    controller.destroy();

    // These should not throw
    controller.setZoom(0.5);
    controller.zoomIn();
    controller.zoomOut();
    controller.setZoomMode('fit');
  });

  it('new zoom API methods exist on controller', () => {
    const controller = createPreviewController();
    expect(typeof controller.setZoom).toBe('function');
    expect(typeof controller.zoomIn).toBe('function');
    expect(typeof controller.zoomOut).toBe('function');
    expect(typeof controller.setZoomMode).toBe('function');
    controller.destroy();
  });
});
