/**
 * Best-effort same-origin renderer.
 *
 * Renders a serialized document snapshot into a PNG: the XHTML is embedded in a
 * data URL loaded by an Image, drawn onto a canvas, and exported via toBlob.
 * This is explicitly NOT pixel-perfect browser rendering — it does not
 * faithfully reproduce every CSS feature, external resource, font, image,
 * pseudo-element, animation, or browser rendering behavior. Web fonts may not
 * be loaded, cross-origin images are not captured, and complex CSS can render
 * approximately.
 *
 * A successful return value means the renderer produced a PNG — nothing more.
 * Any failure path returns null so the capturer surfaces `render-failed`.
 *
 * Dependencies (Image, canvas) are injectable so tests can exercise the
 * control flow in jsdom without real rasterization.
 */
export interface ImageLike {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  width: number;
  height: number;
  src: string;
}

export interface RendererDependencies {
  /** Image constructor (the injectable "new Image()"). */
  createImage?: () => ImageLike;
  /** Returns a canvas or null (e.g. unsupported/headless/tainted). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement | null;
}

export interface CanvasContextLike {
  drawImage(
    image: ImageLike | HTMLImageElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

export interface CanvasLike {
  height: number;
  width: number;
  getContext(contextId: string): CanvasContextLike | null;
  toBlob?: (callback: (blob: Blob | null) => void, type?: string) => void;
  toDataURL?: () => string;
}

/**
 * Render an XHTML snapshot into a PNG Blob.
 *
 * Returns null when the image fails to load, the canvas is unavailable, or
 * PNG export fails — interpreted by the capturer as `render-failed`.
 */
export function renderXhtmlToPng(
  xhtml: string,
  width: number,
  height: number,
  deps: RendererDependencies = {}
): Promise<Blob | null> {
  const createImage = deps.createImage ?? (() => new window.Image());
  const createCanvas =
    deps.createCanvas ??
    ((w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    xhtml
  )}`;

  return new Promise<Blob | null>((resolve) => {
    const img = createImage();
    img.width = width;
    img.height = height;

    img.onload = () => {
      const canvas = createCanvas(width, height);
      if (!canvas) {
        resolve(null);
        return;
      }
      const canvasRef = canvas as CanvasLike;
      const ctx = canvasRef.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      if (typeof canvasRef.toBlob === 'function') {
        canvasRef.toBlob!((blob) => {
          resolve(blob);
        }, 'image/png');
      } else if (typeof canvasRef.toDataURL === 'function') {
        try {
          const dataUrlResult = canvasRef.toDataURL!();
          resolve(dataUrlResult ? dataUrlToBlob(dataUrlResult) : null);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = dataUrl;
  });
}

/** Convert a PNG data URL into a Blob (sync, window.atob-based). */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith('data:') || !dataUrl.includes(',')) {
    return null;
  }
  const parts = dataUrl.split(',');
  const meta = parts[0] ?? '';
  const raw = parts.length > 1 ? (parts[1] ?? '') : '';
  if (!raw) {
    return null;
  }
  try {
    const byteString = window.atob(raw);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i) & 0xff;
    }
    const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/png';
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}
