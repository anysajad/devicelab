/**
 * Project import/export logic.
 *
 * Responsibilities:
 * - Export a ProjectRecord to a portable JSON string (pretty-printed, stable key order)
 * - Generate a sensible filename from a project name
 * - Parse untrusted import text into a validated ProjectRecord (reuse repository pipeline)
 * - Browser download helper (Blob + anchor, jsdom-safe guard)
 *
 * Pure, dependency-free except for parseAndValidateRecord (repository).
 * Untrusted input goes through JSON.parse → migrateRecord → validateProjectData.
 */

import type { ProjectRecord, Result } from './types';
import { parseAndValidateRecord } from './repository';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Serialize a validated ProjectRecord to a portable JSON string.
 *
 * Output is pretty-printed with 2-space indent for readability.
 * Key order matches the ProjectRecord type definition.
 * Only persisted fields are included — no runtime state.
 */
export function exportProjectRecord(record: ProjectRecord): string {
  return JSON.stringify(
    {
      schemaVersion: record.schemaVersion,
      id: record.id,
      meta: {
        name: record.meta.name,
        createdAt: record.meta.createdAt,
        updatedAt: record.meta.updatedAt,
      },
      data: {
        sharedUrl: record.data.sharedUrl,
        entries: record.data.entries.map((e) => ({
          id: e.id,
          deviceId: e.deviceId,
          orientation: e.orientation,
          ...(e.customUrl !== undefined ? { customUrl: e.customUrl } : {}),
          ...(e.viewportMode !== undefined
            ? { viewportMode: e.viewportMode }
            : {}),
          ...(e.customViewportWidth !== undefined
            ? { customViewportWidth: e.customViewportWidth }
            : {}),
          ...(e.customViewportHeight !== undefined
            ? { customViewportHeight: e.customViewportHeight }
            : {}),
        })),
        layoutMode: record.data.layoutMode,
        compareIds: [...record.data.compareIds],
        activeId: record.data.activeId,
      },
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Filename generation
// ---------------------------------------------------------------------------

/**
 * Maximum filename length (excluding extension).
 * Prevents excessively long filenames on most file systems.
 */
const MAX_SLUG_LENGTH = 80;

/**
 * Slugify a project name for use as a filename component.
 * Produces lowercase, hyphen-separated, ASCII-only characters.
 * Falls back to 'project' if the result is empty.
 */
export function slugifyName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

  return slug || 'project';
}

/**
 * Generate a sensible filename for an exported project.
 * Format: `<slugified-name>.devicelab.json`
 */
export function generateExportFilename(projectName: string): string {
  return `${slugifyName(projectName)}.devicelab.json`;
}

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

/** Maximum allowed file size for import (1 MB). */
const MAX_IMPORT_SIZE = 1_000_000;

/**
 * Parse untrusted import text into a validated ProjectRecord.
 *
 * Pipeline: BOM strip → JSON.parse → parseAndValidateRecord (migration + timestamps + data validation).
 * Returns a Result with either the validated record or a rejection reason.
 *
 * The file's `id` is preserved for validation but will NOT be used for persistence
 * — the import flow generates a fresh ID via repository.create().
 * The file's timestamps are validated but discarded after validation.
 */
export function parseProjectImport(text: string): Result<ProjectRecord> {
  // Size check
  if (text.length > MAX_IMPORT_SIZE) {
    return { ok: false, reason: 'file too large (max 1 MB)' };
  }

  // BOM strip
  let json = text;
  if (json.charCodeAt(0) === 0xfeff) {
    json = json.slice(1);
  }

  // JSON parse
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid JSON' };
  }

  // Must be a plain object
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'expected a JSON object' };
  }

  // Validate through the same pipeline as repository reads
  try {
    return parseAndValidateRecord(raw as Record<string, unknown>);
  } catch {
    return { ok: false, reason: 'record validation failed' };
  }
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of text content as a JSON file.
 *
 * Safe to call in jsdom environments — gracefully no-ops if URL.createObjectURL
 * is not available (e.g., in unit tests).
 */
export function downloadTextFile(filename: string, text: string): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
