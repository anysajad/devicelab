/**
 * Browser preview surface — canvas rendering for live screenshots.
 *
 * This component renders a real HTMLCanvasElement that displays
 * screenshot frames from the companion. It is used by
 * BrowserPreviewBackend as its visual surface.
 *
 * Architecture:
 * - Canvas dimensions match the CSS viewport (no DPR scaling yet)
 * - Frames are decoded via ImageBitmap and drawn to canvas
 * - Previous bitmaps are released to prevent memory leaks
 * - Latest-frame-wins semantics (no frame queue)
 */

export interface BrowserPreviewSurfaceConfig {
  /** Container element to mount the canvas into. */
  readonly container: HTMLDivElement;
  /** CSS viewport width. */
  readonly width: number;
  /** CSS viewport height. */
  readonly height: number;
}

export interface BrowserPreviewSurface {
  /** Update canvas dimensions. */
  resize(width: number, height: number): void;
  /** Draw a frame to the canvas. */
  drawFrame(payload: string, width: number, height: number): Promise<void>;
  /** Get the underlying canvas element. */
  getCanvas(): HTMLCanvasElement;
  /** Destroy and clean up. */
  destroy(): void;
}

/**
 * Create a browser preview surface that renders frames to a canvas.
 */
export function createBrowserPreviewSurface(
  config: BrowserPreviewSurfaceConfig
): BrowserPreviewSurface {
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.objectFit = 'contain';

  // Mount canvas into container
  config.container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let currentBitmap: ImageBitmap | null = null;
  let destroyed = false;

  function resize(newWidth: number, newHeight: number): void {
    if (destroyed) return;
    canvas.width = newWidth;
    canvas.height = newHeight;
  }

  async function drawFrame(
    payload: string,
    width: number,
    height: number
  ): Promise<void> {
    if (destroyed) return;

    try {
      // Decode base64 to blob
      const byteString = atob(payload);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/jpeg' });

      // Create ImageBitmap
      const bitmap = await createImageBitmap(blob);

      // Release previous bitmap
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = bitmap;

      // Draw to canvas
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, width, height);
      }
    } catch {
      // Frame decode failed — skip silently
    }
  }

  function getCanvas(): HTMLCanvasElement {
    return canvas;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }

    canvas.remove();
  }

  return {
    resize,
    drawFrame,
    getCanvas,
    destroy,
  };
}
