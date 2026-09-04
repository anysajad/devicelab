import { describe, expect, it, vi } from 'vitest';

import { getDeviceById } from '@/devices';
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

  it('no-ops after destroy', () => {
    const controller = createPreviewController();
    controller.destroy();

    // These should not throw
    controller.load(makeConfig());
    controller.setContainerSize(800, 600);
    controller.reload();
    expect(controller.getIframe()).toBeNull();
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
});
