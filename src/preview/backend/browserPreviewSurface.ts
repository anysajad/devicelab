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
 * - Handles pointer/wheel/keyboard input events
 */

/** Input event types that the surface can emit. */
export interface PointerInputEvent {
  readonly type: 'move' | 'down' | 'up' | 'click' | 'doubleClick';
  readonly x: number;
  readonly y: number;
  readonly button?: string;
  readonly clickCount?: number;
}

export interface WheelInputEvent {
  readonly type: 'wheel';
  readonly deltaX: number;
  readonly deltaY: number;
}

export interface KeyboardInputEvent {
  readonly type: 'keyDown' | 'keyUp' | 'type';
  readonly key?: string;
  readonly text?: string;
}

export type SurfaceInputEvent =
  PointerInputEvent | WheelInputEvent | KeyboardInputEvent;

export interface BrowserPreviewSurfaceConfig {
  /** Container element to mount the canvas into. */
  readonly container: HTMLDivElement;
  /** CSS viewport width. */
  readonly width: number;
  /** CSS viewport height. */
  readonly height: number;
  /** Callback for input events. */
  readonly onInput?: (event: SurfaceInputEvent) => void;
}

export interface BrowserPreviewSurface {
  /** Update canvas dimensions. */
  resize(width: number, height: number): void;
  /** Draw a frame to the canvas. */
  drawFrame(payload: string, width: number, height: number): Promise<void>;
  /** Get the underlying canvas element. */
  getCanvas(): HTMLCanvasElement;
  /** Get viewport dimensions for coordinate conversion. */
  getViewportDimensions(): { width: number; height: number };
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
  // Prevent default drag behavior and text selection
  canvas.style.userSelect = 'none';
  canvas.style.touchAction = 'none';

  // Mount canvas into container
  config.container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let currentBitmap: ImageBitmap | null = null;
  let destroyed = false;
  let viewportWidth = config.width;
  let viewportHeight = config.height;
  const onInput: ((event: SurfaceInputEvent) => void) | undefined =
    config.onInput;

  // ---------------------------------------------------------------------------
  // Coordinate conversion
  // ---------------------------------------------------------------------------

  function clientToViewport(
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  // ---------------------------------------------------------------------------
  // Input event handlers
  // ---------------------------------------------------------------------------

  function handlePointerDown(e: PointerEvent): void {
    if (destroyed) return;
    e.preventDefault();
    canvas.focus();
    const { x, y } = clientToViewport(e.clientX, e.clientY);
    onInput?.({
      type: 'down',
      x,
      y,
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
    });
  }

  function handlePointerUp(e: PointerEvent): void {
    if (destroyed) return;
    e.preventDefault();
    const { x, y } = clientToViewport(e.clientX, e.clientY);
    onInput?.({
      type: 'up',
      x,
      y,
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
    });
  }

  function handleClick(e: MouseEvent): void {
    if (destroyed) return;
    e.preventDefault();
    const { x, y } = clientToViewport(e.clientX, e.clientY);
    onInput?.({
      type: 'click',
      x,
      y,
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
      clickCount: e.detail,
    });
  }

  function handleDoubleClick(e: MouseEvent): void {
    if (destroyed) return;
    e.preventDefault();
    const { x, y } = clientToViewport(e.clientX, e.clientY);
    onInput?.({
      type: 'doubleClick',
      x,
      y,
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
    });
  }

  function handleWheel(e: WheelEvent): void {
    if (destroyed) return;
    e.preventDefault();
    onInput?.({
      type: 'wheel',
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (destroyed) return;
    // Only handle if canvas is focused
    if (document.activeElement !== canvas) return;
    e.preventDefault();
    onInput?.({
      type: 'keyDown',
      key: e.key,
    });
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (destroyed) return;
    if (document.activeElement !== canvas) return;
    e.preventDefault();
    onInput?.({
      type: 'keyUp',
      key: e.key,
    });
  }

  // ---------------------------------------------------------------------------
  // Event listener setup
  // ---------------------------------------------------------------------------

  function setupEventListeners(): void {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);
  }

  function removeEventListeners(): void {
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('dblclick', handleDoubleClick);
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('keydown', handleKeyDown);
    canvas.removeEventListener('keyup', handleKeyUp);
  }

  // Setup listeners on creation
  setupEventListeners();

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  function resize(newWidth: number, newHeight: number): void {
    if (destroyed) return;
    viewportWidth = newWidth;
    viewportHeight = newHeight;
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

  function getViewportDimensions(): { width: number; height: number } {
    return { width: viewportWidth, height: viewportHeight };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    removeEventListeners();

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
    getViewportDimensions,
    destroy,
  };
}
