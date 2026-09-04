/**
 * Pure filename generation for captured screenshots.
 *
 * Resulting filenames are safe to use as download file names: they contain no
 * path separators or otherwise filesystem-unsafe characters, and always end
 * with `.png`. For example:
 *   `iphone-15_393x852.png`
 *   `iphone-15_393x852_2026-02-26T02-30-00-000Z.png`
 */

/** Substitute characters that are invalid/unsafe in file names. */
export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_]+/, '')
    .replace(/_+$/, '')
    .replace(/_+/g, '_')
    .replace(/[.]+/g, '.')
    .slice(0, 80);
}

/**
 * Convert a timestamp to a file-name-safe ISO-like string.
 * (Colons are invalid in file names on Windows; we replace them.)
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:]/g, '-');
}

export interface ScreenshotFilenameOptions {
  /** Include a timestamp in the filename. */
  readonly timestamp?: boolean;
  /** Optional date override (for deterministic tests). */
  readonly date?: Date;
}

/** Build a sanitized screenshot filename. */
export function buildScreenshotFilename(
  deviceName: string,
  width: number,
  height: number,
  options: ScreenshotFilenameOptions = {}
): string {
  const base = `${sanitizeFilenamePart(deviceName)}_${Math.round(
    width
  )}x${Math.round(height)}`;
  if (options.timestamp) {
    return `${base}_${formatTimestamp(options.date ?? new Date())}.png`;
  }
  return `${base}.png`;
}
