/**
 * Coordinate conversion utilities for browser preview input.
 *
 * Converts between multiple coordinate spaces:
 * 1. Browser viewport CSS pixels (Playwright page coordinates)
 * 2. Canvas internal pixel coordinates
 * 3. Canvas displayed CSS dimensions
 * 4. DeviceLab preview zoom
 * 5. Pointer event client coordinates
 *
 * The companion/Playwright page receives coordinates in browser viewport CSS pixels.
 */

/** Configuration for coordinate conversion. */
export interface CoordinateConversionConfig {
  /** Browser viewport width in CSS pixels. */
  readonly viewportWidth: number;
  /** Browser viewport height in CSS pixels. */
  readonly viewportHeight: number;
  /** Canvas internal width (pixels). */
  readonly canvasWidth: number;
  /** Canvas internal height (pixels). */
  readonly canvasHeight: number;
  /** Canvas displayed width in CSS pixels. */
  readonly displayedWidth: number;
  /** Canvas displayed height in CSS pixels. */
  readonly displayedHeight: number;
}

/** Result of coordinate conversion. */
export interface ConvertedCoordinate {
  /** X coordinate in browser viewport CSS pixels. */
  readonly x: number;
  /** Y coordinate in browser viewport CSS pixels. */
  readonly y: number;
  /** Whether the coordinate is within the viewport bounds. */
  readonly inBounds: boolean;
}

/**
 * Convert client coordinates from a pointer event to browser viewport CSS pixels.
 *
 * This is the primary conversion function used by the input system.
 *
 * The conversion pipeline:
 * 1. Get canvas bounding rect relative to viewport
 * 2. Calculate canvas-local coordinates (client - rect)
 * 3. Scale from displayed size to internal canvas size
 * 4. Map from canvas internal coordinates to viewport CSS pixels
 *
 * @param clientX - Client X from pointer event
 * @param clientY - Client Y from pointer event
 * @param config - Coordinate conversion configuration
 * @returns Converted coordinates in browser viewport CSS pixels
 */
export function clientToViewport(
  clientX: number,
  clientY: number,
  config: CoordinateConversionConfig
): ConvertedCoordinate {
  // Canvas bounding rect is not needed here — we use the displayed dimensions
  // directly since the canvas is positioned at (0,0) in its container.
  // The caller (surface) provides displayed dimensions from getBoundingClientRect.

  // Scale factor from displayed to internal canvas pixels
  const scaleX = config.canvasWidth / config.displayedWidth;
  const scaleY = config.canvasHeight / config.displayedHeight;

  // Convert displayed coordinates to canvas internal coordinates
  const canvasX = clientX * scaleX;
  const canvasY = clientY * scaleY;

  // Map canvas internal coordinates to viewport CSS pixels
  // Canvas internal coordinates correspond 1:1 to viewport CSS pixels
  // (canvas dimensions = viewport dimensions, no DPR scaling)
  const viewportX = canvasX;
  const viewportY = canvasY;

  // Check bounds
  const inBounds =
    viewportX >= 0 &&
    viewportY >= 0 &&
    viewportX <= config.viewportWidth &&
    viewportY <= config.viewportHeight;

  return {
    x: viewportX,
    y: viewportY,
    inBounds,
  };
}

/**
 * Convert client coordinates from a pointer event to browser viewport CSS pixels
 * using the canvas element's bounding rect.
 *
 * This is a convenience wrapper that extracts displayed dimensions from the canvas.
 *
 * @param clientX - Client X from pointer event
 * @param clientY - Client Y from pointer event
 * @param canvas - The canvas element
 * @param viewportWidth - Browser viewport width in CSS pixels
 * @param viewportHeight - Browser viewport height in CSS pixels
 * @returns Converted coordinates in browser viewport CSS pixels
 */
export function clientToViewportFromCanvas(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  viewportWidth: number,
  viewportHeight: number
): ConvertedCoordinate {
  const rect = canvas.getBoundingClientRect();

  const config: CoordinateConversionConfig = {
    viewportWidth,
    viewportHeight,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    displayedWidth: rect.width,
    displayedHeight: rect.height,
  };

  // Adjust client coordinates relative to canvas
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;

  return clientToViewport(relativeX, relativeY, config);
}

/**
 * Validate that a coordinate is within the viewport bounds.
 */
export function isWithinViewport(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return x >= 0 && y >= 0 && x <= viewportWidth && y <= viewportHeight;
}

/**
 * Clamp coordinates to viewport bounds.
 */
export function clampToViewport(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(viewportWidth, x)),
    y: Math.max(0, Math.min(viewportHeight, y)),
  };
}
