import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreviewController, PreviewState } from '../types';
import type { ScreenshotResult } from '../../screenshot';

const mock = vi.hoisted(() => ({
  capturer: { capture: vi.fn() },
}));

vi.mock('../../screenshot', () => ({
  createScreenshotCapturer: () => mock.capturer,
}));

import { useScreenshot } from '../useScreenshot';

function makeController(overrides?: {
  iframe?: HTMLIFrameElement | null;
  deviceName?: string;
  width?: number;
  height?: number;
  lifecycle?: PreviewState['lifecycle'];
}): PreviewController {
  const {
    iframe = document.createElement('iframe'),
    deviceName = 'iPhone 15',
    width = 393,
    height = 852,
    lifecycle = 'ready',
  } = overrides ?? {};
  return {
    getState: () =>
      ({
        config: { device: { name: deviceName } },
        viewport: { width, height },
        zoom: 1,
        zoomMode: 'fit',
        manualZoom: 1,
        effectiveZoom: 1,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        lifecycle,
        error: null,
      }) as PreviewState,
    getIframe: () => iframe,
  } as unknown as PreviewController;
}

function okResult(): ScreenshotResult {
  return {
    status: 'ok',
    blob: new Blob(['png'], { type: 'image/png' }),
    url: 'blob:mock-url',
    filename: 'iphone_15_393x852.png',
    width: 393,
    height: 852,
  };
}

describe('useScreenshot', () => {
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    clickSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() =>
      clickSpy()
    );
    mock.capturer.capture.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it('triggers a download and surfaces status ok on success', async () => {
    mock.capturer.capture.mockResolvedValue(okResult());
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const { result } = renderHook(() => useScreenshot(makeController()));

    expect(result.current.status).toBeNull();
    expect(result.current.isBusy).toBe(false);

    await act(async () => {
      await result.current.capture();
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.isBusy).toBe(false);
    // An <a download> was wired to the produced object URL and clicked.
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const appended = appendSpy.mock.calls.find(
      ([node]) => (node as HTMLElement).tagName === 'A'
    )?.[0] as HTMLAnchorElement;
    expect(appended).not.toBeNull();
    expect(appended.getAttribute('href')).toBe('blob:mock-url');
    expect(appended.getAttribute('download')).toBe('iphone_15_393x852.png');
    appendSpy.mockRestore();
  });

  it('passes the iframe, device name, and spec dimensions to the capturer', async () => {
    mock.capturer.capture.mockResolvedValue(okResult());
    const iframe = document.createElement('iframe');
    const controller = makeController({
      iframe,
      deviceName: 'Pixel 9',
      width: 412,
      height: 915,
    });
    const { result } = renderHook(() => useScreenshot(controller));

    await act(async () => {
      await result.current.capture();
    });

    expect(mock.capturer.capture).toHaveBeenCalledWith(
      { iframe, deviceName: 'Pixel 9' },
      { width: 412, height: 915 }
    );
  });

  it('surfaces cross-origin status without downloading', async () => {
    mock.capturer.capture.mockResolvedValue({ status: 'cross-origin' });
    const { result } = renderHook(() => useScreenshot(makeController()));

    await act(async () => {
      await result.current.capture();
    });

    expect(result.current.status).toBe('cross-origin');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('surfaces not-ready and render-failed statuses without downloading', async () => {
    for (const status of ['not-ready', 'render-failed'] as const) {
      mock.capturer.capture.mockResolvedValueOnce({ status });
      const { result, unmount } = renderHook(() =>
        useScreenshot(makeController())
      );
      await act(async () => {
        await result.current.capture();
      });
      expect(result.current.status).toBe(status);
      expect(clickSpy).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('surfaces render-failed when capture throws', async () => {
    mock.capturer.capture.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useScreenshot(makeController()));

    await act(async () => {
      await result.current.capture();
    });

    expect(result.current.status).toBe('render-failed');
  });

  it('is busy while a capture is in flight and ignores re-entry', async () => {
    let resolve: (r: ScreenshotResult) => void = () => {};
    mock.capturer.capture.mockImplementation(
      () =>
        new Promise<ScreenshotResult>((res) => {
          resolve = res;
        })
    );
    const { result } = renderHook(() => useScreenshot(makeController()));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.capture();
    });
    expect(result.current.isBusy).toBe(true);

    // Re-entry while busy is a no-op.
    await act(async () => {
      await result.current.capture();
    });
    expect(mock.capturer.capture).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(okResult());
      await first;
    });
    expect(result.current.isBusy).toBe(false);
  });

  it('revokes the last object URL on unmount', async () => {
    mock.capturer.capture.mockResolvedValue(okResult());
    const { result, unmount } = renderHook(() =>
      useScreenshot(makeController())
    );

    await act(async () => {
      await result.current.capture();
    });

    unmount();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('refuses to capture a failed (error) preview and never fabricates a PNG', async () => {
    mock.capturer.capture.mockResolvedValue(okResult());
    const controller = makeController({
      lifecycle: 'error',
      iframe: document.createElement('iframe'),
    });
    const { result } = renderHook(() => useScreenshot(controller));

    await act(async () => {
      await result.current.capture();
    });

    // The capturer must never run against an empty/failed document.
    expect(mock.capturer.capture).not.toHaveBeenCalled();
    expect(result.current.status).toBe('not-ready');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(false);
  });

  it('never mutates the controller', async () => {
    mock.capturer.capture.mockResolvedValue(okResult());
    const setZoomSpy = vi.fn();
    const controller = makeController() as unknown as PreviewController & {
      setZoom: () => void;
    };
    controller.setZoom = setZoomSpy;
    const { result } = renderHook(() => useScreenshot(controller));

    await act(async () => {
      await result.current.capture();
    });

    expect(setZoomSpy).not.toHaveBeenCalled();
  });
});
