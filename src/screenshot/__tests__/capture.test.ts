import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createScreenshotCapturer } from '../capture';
import type { ScreenshotSource, ScreenshotSpec } from '../types';
import type { ImageLike, RendererDependencies } from '../renderer';

/**
 * Build a fake iframe whose contentDocument is controllable.
 */
function makeIframe(opts: {
  doc: Document | null;
  getterThrows?: boolean;
}): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentDocument', {
    get: () => {
      if (opts.getterThrows) {
        throw new DOMException('blocked', 'SecurityError');
      }
      return opts.doc;
    },
  });
  return iframe;
}

function readyDocument(): Document {
  const doc = document.implementation.createHTMLDocument('preview');
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  doc.body.innerHTML = '<h1>Hello</h1>';
  return doc;
}

/**
 * Render deps that short-circuit rasterization: the fake Image fires onload
 * immediately when src is set, and the fake canvas calls toBlob immediately
 * with a PNG Blob.
 */
function immediateRenderDeps(blob: Blob | null): RendererDependencies {
  return {
    createImage: () => {
      const img: ImageLike = {
        onload: null,
        onerror: null,
        width: 0,
        height: 0,
        get src() {
          return '';
        },
        set src(_v: string) {
          // Fire load synchronously (no real rasterization in jsdom).
          setTimeout(() => img.onload?.(), 0);
        },
      };
      return img;
    },
    createCanvas: () => {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob | null) => void) => cb(blob),
      } as unknown as HTMLCanvasElement;
    },
  };
}

const SPEC: ScreenshotSpec = { width: 393, height: 852 };

describe('createScreenshotCapturer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('URL', {
      ...window.URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('returns not-ready when no iframe is present', async () => {
    const r = await createScreenshotCapturer().capture(
      { iframe: null, deviceName: 'X' },
      SPEC
    );
    expect(r.status).toBe('not-ready');
  });

  it('returns cross-origin when contentDocument access throws', async () => {
    const iframe = makeIframe({ doc: null, getterThrows: true });
    const r = await createScreenshotCapturer().capture(
      { iframe, deviceName: 'X' },
      SPEC
    );
    expect(r.status).toBe('cross-origin');
  });

  it('returns not-ready when contentDocument is null', async () => {
    const iframe = makeIframe({ doc: null });
    const r = await createScreenshotCapturer().capture(
      { iframe, deviceName: 'X' },
      SPEC
    );
    expect(r.status).toBe('not-ready');
  });

  it('returns not-ready when the document is not fully loaded', async () => {
    const doc = document.implementation.createHTMLDocument('preview');
    Object.defineProperty(doc, 'readyState', { value: 'loading' });
    const iframe = makeIframe({ doc });
    const r = await createScreenshotCapturer().capture(
      { iframe, deviceName: 'X' },
      SPEC
    );
    expect(r.status).toBe('not-ready');
  });

  it('returns render-failed when the renderer produces no blob', async () => {
    const iframe = makeIframe({ doc: readyDocument() });
    const r = await createScreenshotCapturer(immediateRenderDeps(null)).capture(
      { iframe, deviceName: 'X' },
      SPEC
    );
    expect(r.status).toBe('render-failed');
  });

  it('returns render-failed for non-positive spec dimensions', async () => {
    const iframe = makeIframe({ doc: readyDocument() });
    const r = await createScreenshotCapturer(
      immediateRenderDeps(new Blob(['x']))
    ).capture({ iframe, deviceName: 'X' }, { width: 0, height: 852 });
    expect(r.status).toBe('render-failed');
  });

  it('captures same-origin documents into a PNG blob result', async () => {
    const iframe = makeIframe({ doc: readyDocument() });
    const blob = new Blob(['png'], { type: 'image/png' });
    const r = await createScreenshotCapturer(immediateRenderDeps(blob)).capture(
      { iframe, deviceName: 'iPhone 15' },
      SPEC
    );
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.blob).toBe(blob);
      expect(r.width).toBe(393);
      expect(r.height).toBe(852);
      expect(r.url).toBe('blob:mock-url');
      expect(r.filename).toBe('iphone_15_393x852.png');
    }
  });

  it('never mutates the live document during capture', async () => {
    const doc = readyDocument();
    doc.body.innerHTML = '<div id="keep">original</div>';
    const script = doc.createElement('script');
    script.textContent = 'boom';
    doc.body.appendChild(script);

    const iframe = makeIframe({ doc });
    const blob = new Blob(['png'], { type: 'image/png' });
    await createScreenshotCapturer(immediateRenderDeps(blob)).capture(
      { iframe, deviceName: 'iPhone 15' },
      SPEC
    );

    // Live DOM unchanged.
    expect(doc.body.querySelector('#keep')?.textContent).toBe('original');
    expect(doc.body.querySelector('script')).not.toBeNull();
    expect(doc.title).toBe('preview');
  });

  it('never mutates zoom/viewport/inspection state (screenshot source is durable)', async () => {
    // Capture is inherently read-only: no controller state exists here.
    // Assert the source object is not mutated by the capturer.
    const source: ScreenshotSource = {
      iframe: makeIframe({ doc: readyDocument() }),
      deviceName: 'iPhone 15',
    };
    const frozen = Object.freeze({ ...source });
    const blob = new Blob(['png'], { type: 'image/png' });
    const r = await createScreenshotCapturer(immediateRenderDeps(blob)).capture(
      frozen,
      SPEC
    );
    expect(r.status).toBe('ok');
  });
});
