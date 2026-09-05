import { describe, expect, it, vi } from 'vitest';

import { dataUrlToBlob, renderXhtmlToPng } from '../renderer';
import type { ImageLike } from '../renderer';

interface FakeImageOptions {
  /** Fire onerror instead of onload when src is set. */
  failToLoad?: boolean;
}

/**
 * Image-like whose `src` setter synchronously fires the renderer's handlers.
 * (jsdom cannot rasterize SVG data URLs, so we short-circuit control flow.)
 */
function makeImageLike(opts: FakeImageOptions = {}): ImageLike {
  const img: ImageLike = {
    onload: null,
    onerror: null,
    width: 0,
    height: 0,
    get src() {
      return '';
    },
    set src(_v: string) {
      // The renderer assigns handlers BEFORE setting src, so firing
      // synchronously here exercises the full render control flow.
      if (opts.failToLoad) img.onerror?.();
      else img.onload?.();
    },
  };
  return img;
}

function makeCanvasLike(
  opts: {
    withToBlob?: boolean;
    blob?: Blob | null;
    dataUrl?: string;
    contextAvailable?: boolean;
  } = {}
) {
  const toDataURL = opts.dataUrl ? vi.fn(() => opts.dataUrl) : undefined;
  const toBlob = opts.withToBlob
    ? vi.fn((cb: (b: Blob | null) => void) => cb(opts.blob ?? null))
    : undefined;
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() =>
      opts.contextAvailable === false ? null : { drawImage: vi.fn() }
    ),
    toBlob,
    toDataURL,
  } as unknown as HTMLCanvasElement;
}

describe('renderXhtmlToPng', () => {
  it('produces a PNG blob on success', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const result = renderXhtmlToPng('<p>x</p>', 393, 852, {
      createImage: () => makeImageLike(),
      createCanvas: () =>
        makeCanvasLike({
          withToBlob: true,
          blob,
        }) as unknown as HTMLCanvasElement,
    });
    const blobOut = await result;
    expect(blobOut).toBe(blob);
  });

  it('resolves null when the image fails to load', async () => {
    const result = renderXhtmlToPng('<p>x</p>', 10, 10, {
      createImage: () => makeImageLike({ failToLoad: true }),
      createCanvas: () => makeCanvasLike() as unknown as HTMLCanvasElement,
    });
    expect(await result).toBeNull();
  });

  it('resolves null when the canvas context is unavailable', async () => {
    const result = renderXhtmlToPng('<p>x</p>', 10, 10, {
      createImage: () => makeImageLike(),
      createCanvas: () =>
        makeCanvasLike({
          contextAvailable: false,
        }) as unknown as HTMLCanvasElement,
    });
    expect(await result).toBeNull();
  });

  it('falls back to data URL export when toBlob is unavailable', async () => {
    const canvas = makeCanvasLike({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    });
    const result = renderXhtmlToPng('<p>x</p>', 10, 10, {
      createImage: () => makeImageLike(),
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    });
    const blob = await result;
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
  });

  it('resolves null when export yields nothing', async () => {
    const result = renderXhtmlToPng('<p>x</p>', 10, 10, {
      createImage: () => makeImageLike(),
      createCanvas: () =>
        makeCanvasLike({
          withToBlob: true,
          blob: null,
        }) as unknown as HTMLCanvasElement,
    });
    expect(await result).toBeNull();
  });

  it('embeds the XHTML inside an SVG foreignObject wrapper for browser decoding', async () => {
    let assignedSrc = '';
    const result = renderXhtmlToPng('<p>x</p>', 393, 852, {
      createImage: () => {
        const img: ImageLike = {
          onload: null,
          onerror: null,
          width: 0,
          height: 0,
          get src() {
            return assignedSrc;
          },
          set src(v: string) {
            assignedSrc = v;
            img.onload?.();
          },
        };
        return img;
      },
      createCanvas: () =>
        makeCanvasLike({
          withToBlob: true,
          blob: new Blob(['png'], { type: 'image/png' }),
        }) as unknown as HTMLCanvasElement,
    });
    await result;
    const decoded = decodeURIComponent(
      assignedSrc.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
    );
    expect(decoded).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" width="393" height="852">'
    );
    expect(decoded).toContain(
      '<foreignObject width="100%" height="100%"><p>x</p></foreignObject></svg>'
    );
  });
});

describe('dataUrlToBlob', () => {
  it('converts a base64 PNG data URL to a Blob', () => {
    const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=');
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
  });

  it('returns null for malformed input', () => {
    expect(dataUrlToBlob('not-a-data-url')).toBeNull();
    expect(dataUrlToBlob('')).toBeNull();
    expect(dataUrlToBlob('data:image/png;base64,')).toBeNull();
    expect(dataUrlToBlob('data:image/png;base64,!!not-valid!!')).toBeNull();
  });
});
