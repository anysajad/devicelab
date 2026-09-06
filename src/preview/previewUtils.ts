import type {
  DeviceDefinition,
  DeviceOrientation,
  SafeAreaInsets,
} from '@/devices';
import type { ComputedViewport, ZoomMode } from './types';

/** Padding (px) around the iframe inside the host container. */
const CONTAINER_PADDING = 32;

/** Minimum custom viewport dimension (CSS pixels). Application-level constraint. */
export const CUSTOM_VIEWPORT_MIN = 100;

/** Maximum custom viewport dimension (CSS pixels). Application-level constraint. */
export const CUSTOM_VIEWPORT_MAX = 4000;

/** Minimum zoom level (25%). */
export const ZOOM_MIN = 0.25;

/** Maximum zoom level (300%). */
export const ZOOM_MAX = 3.0;

/** Zoom step for zoomIn/zoomOut (10%). */
export const ZOOM_STEP = 0.1;

/** Clamp a zoom value to [ZOOM_MIN, ZOOM_MAX]. */
export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);
}

/** Compute effective zoom from mode, auto-fit zoom, and manual zoom. */
export function computeEffectiveZoom(
  mode: ZoomMode,
  autoFitZoom: number,
  manualZoom: number
): number {
  return mode === 'manual' ? clampZoom(manualZoom) : autoFitZoom;
}

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

/** Percent-encoded whitespace seen when engines normalize bare-host inputs. */
const ENCODED_WHITESPACE = /%20|%09|%0a|%0d/i;

/**
 * Whether a hostname refers to the local machine.
 *
 * Recognizes the `localhost` name, the `.localhost` reserved suffix, the
 * IPv4 loopback range (127.0.0.0/8), the IPv6 loopback `::1`, and the
 * IPv4-mapped IPv6 loopback (::ffff:127.x.x.x). `URL.hostname` reports IPv6
 * literals with surrounding brackets, which are stripped before matching.
 *
 * The preview engine uses this to scope its reachability probe so it never
 * pings arbitrary remote hosts.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/**
 * Pick a default scheme for a scheme-less input (bare hostname or
 * protocol-relative). Loopback inputs default to `http:` because local dev
 * servers are usually plain HTTP; everything else keeps the existing
 * `https:` default.
 */
function defaultSchemeFor(schemeLessInput: string): string {
  try {
    const probe = new URL(`https://${schemeLessInput}`);
    return isLoopbackHostname(probe.hostname) ? 'http:' : 'https:';
  } catch {
    // Unparseable input — the subsequent parse in sanitizeUrl will reject it.
    return 'https:';
  }
}

/**
 * Validate and sanitize a URL for use as an iframe src.
 * Returns the original URL if valid, or 'about:blank' if invalid.
 *
 * Rejects dangerous protocols (javascript:, data:, file:, etc.), URLs that
 * embed credentials, and empty strings. Scheme-less inputs default to `http:`
 * for loopback hosts and `https:` otherwise.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return 'about:blank';
  }

  // Allow protocol-relative URLs and bare hostnames by prepending the
  // appropriate default scheme. Explicitly-typed schemes are preserved.
  let candidate = trimmed;
  if (candidate.startsWith('//')) {
    candidate = candidate.slice(2);
    candidate = `${defaultSchemeFor(candidate)}//${candidate}`;
  } else if (!candidate.includes('://') && !candidate.startsWith('about:')) {
    candidate = `${defaultSchemeFor(candidate)}//${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    // Some engines (Chromium) percent-encode whitespace in bare-host inputs,
    // turning "this is not a url" into a "valid" URL with a percent-encoded
    // hostname. A hostname containing whitespace (raw or encoded) is never a
    // real preview target, so reject it explicitly to keep validation
    // deterministic across engines.
    if (
      /\s/.test(parsed.hostname) ||
      ENCODED_WHITESPACE.test(parsed.hostname)
    ) {
      return 'about:blank';
    }
    // Embedded credentials are almost never intentional in a preview tool and
    // risk leaking secrets into shared or persisted state.
    if (parsed.username !== '' || parsed.password !== '') {
      return 'about:blank';
    }
    if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    // Malformed URL — fall through to rejected.
  }

  return 'about:blank';
}

/**
 * Parse and validate a custom viewport dimension string.
 * Returns a valid integer in [CUSTOM_VIEWPORT_MIN, CUSTOM_VIEWPORT_MAX],
 * or null for invalid input (empty, non-numeric, decimal, out of range).
 *
 * Rejects decimals rather than truncating them — "1024.5" is invalid.
 * Does not clamp — invalid input preserves the last valid stored value.
 */
export function parseCustomViewport(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  // Reject if the string contains a decimal point or scientific notation
  if (trimmed.includes('.') || trimmed.toLowerCase().includes('e')) return null;

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;

  const int = Math.trunc(num);
  if (int < CUSTOM_VIEWPORT_MIN || int > CUSTOM_VIEWPORT_MAX) return null;

  return int;
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
  error: string | null,
  zoomMode: ZoomMode = 'fit',
  manualZoom = 1
) {
  const orientation = resolveOrientation(config.device, config.orientation);
  const viewport = computeViewport(config.device, orientation);
  const zoom = computeZoom(viewport, containerWidth, containerHeight);
  const safeArea = computeSafeArea(config.device, orientation);
  const effectiveZoom = computeEffectiveZoom(zoomMode, zoom, manualZoom);

  return {
    config: { ...config, orientation },
    viewport,
    zoom,
    zoomMode,
    manualZoom,
    effectiveZoom,
    safeArea,
    lifecycle,
    error,
  };
}
