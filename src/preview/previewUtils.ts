import type {
  DeviceDefinition,
  DeviceOrientation,
  SafeAreaInsets,
} from '@/devices';
import type { ComputedViewport } from './types';

/** Padding (px) around the iframe inside the host container. */
const CONTAINER_PADDING = 32;

/**
 * Compute the iframe's CSS viewport dimensions for the given device and
 * orientation.
 *
 * The DeviceDefinition viewport stores the device's native dimensions:
 * - Phones/tablets: portrait (width < height)
 * - Desktops: landscape (width > height)
 *
 * When the requested orientation differs from the viewport's natural
 * orientation, width and height are swapped.
 */
export function computeViewport(
  device: DeviceDefinition,
  orientation: DeviceOrientation
): ComputedViewport {
  const { width, height } = device.viewport;
  const isViewportLandscape = width > height;

  if (orientation === 'landscape') {
    // If viewport is already landscape, return as-is.
    if (isViewportLandscape) {
      return { width, height };
    }
    return { width: height, height: width };
  }

  // Portrait: if viewport is already portrait, return as-is.
  if (!isViewportLandscape) {
    return { width, height };
  }
  return { width: height, height: width };
}

/**
 * Resolve the effective orientation. If the device does not support the
 * requested orientation, the device's first supported orientation is used.
 */
export function resolveOrientation(
  device: DeviceDefinition,
  requested: DeviceOrientation
): DeviceOrientation {
  if (device.orientations.includes(requested)) {
    return requested;
  }
  // Fallback: first supported orientation (guaranteed ≥ 1 by Device Registry).
  return device.orientations[0] ?? 'portrait';
}

/**
 * Compute the host-side zoom factor so the iframe fits inside the container
 * while preserving the device aspect ratio. Never exceeds 1 (no放大 beyond
 * native CSS pixel resolution).
 */
export function computeZoom(
  viewport: ComputedViewport,
  containerWidth: number,
  containerHeight: number
): number {
  const availableWidth = Math.max(containerWidth - CONTAINER_PADDING, 0);
  const availableHeight = Math.max(containerHeight - CONTAINER_PADDING, 0);

  if (viewport.width <= 0 || viewport.height <= 0) {
    return 1;
  }

  const scaleX = availableWidth / viewport.width;
  const scaleY = availableHeight / viewport.height;

  return Math.min(scaleX, scaleY, 1);
}

/**
 * Return the safe-area insets for the current device and orientation.
 *
 * The Device Registry stores insets in portrait orientation. For landscape,
 * the values are transposed: top→left, right→top, bottom→right, left→bottom.
 *
 * These are metadata values. They do NOT automatically cause the browser's
 * native `env(safe-area-inset-*)` CSS functions to resolve to these values.
 * Actual safe-area behavior depends on the browser, the embedding context,
 * and whether the iframe is same-origin. Overriding `env()` via custom CSS
 * properties is not a reliable mechanism.
 */
export function computeSafeArea(
  device: DeviceDefinition,
  orientation: DeviceOrientation
): SafeAreaInsets {
  const { top, right, bottom, left } = device.safeArea;
  if (orientation === 'landscape') {
    return { top: left, right: top, bottom: right, left: bottom };
  }
  return { top, right, bottom, left };
}

/** Allowed URL protocols for the preview iframe. */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Validate and sanitize a URL for use as an iframe src.
 * Returns the original URL if valid, or 'about:blank' if invalid.
 *
 * Rejects dangerous protocols (javascript:, data:, file:, etc.)
 * and empty strings.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return 'about:blank';
  }

  // Allow protocol-relative URLs and bare hostnames by prepending https:
  let candidate = trimmed;
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  } else if (!candidate.includes('://') && !candidate.startsWith('about:')) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    // Malformed URL — fall through to rejected.
  }

  return 'about:blank';
}

/**
 * Compute the full preview state from a config and container dimensions.
 * Pure function — no side effects.
 */
export function computePreviewState(
  config: {
    url: string;
    device: DeviceDefinition;
    orientation: DeviceOrientation;
  },
  containerWidth: number,
  containerHeight: number,
  lifecycle: 'idle' | 'loading' | 'ready' | 'error',
  error: string | null
) {
  const orientation = resolveOrientation(config.device, config.orientation);
  const viewport = computeViewport(config.device, orientation);
  const zoom = computeZoom(viewport, containerWidth, containerHeight);
  const safeArea = computeSafeArea(config.device, orientation);

  return {
    config: { ...config, orientation },
    viewport,
    zoom,
    safeArea,
    lifecycle,
    error,
  };
}
