/**
 * Dependency-free validation and normalization of project records.
 *
 * Three outcomes per field:
 *   - reject: the record is malformed → result.ok === false
 *   - normalize: safely repair stale/invalid data in-memory (no mutation on disk)
 *   - tolerate: unknown extra fields ignored (forward-compatible)
 *
 * Validation MUST NOT synthesize timestamps or call createProjectMeta.
 * Missing/invalid timestamps on an existing record → reject.
 * Only a future explicit migration may repair historical timestamps.
 */

import { getDeviceById } from '@/devices';
import { CUSTOM_DEVICE_ID } from '@/preview/types';

import type { ProjectData, ProjectEntryData, Result } from './types';
import { DEFAULT_PROJECT_NAME } from './schema';

/** Minimum custom viewport dimension (matches previewUtils). */
const CUSTOM_VIEWPORT_MIN = 100;

/** Maximum custom viewport dimension (matches previewUtils). */
const CUSTOM_VIEWPORT_MAX = 4000;

/** Allowed values for orientation. */
const VALID_ORIENTATIONS = new Set(['portrait', 'landscape']);

/** Allowed values for layout mode. */
const VALID_LAYOUT_MODES = new Set(['grid', 'focus', 'compare']);

/** Allowed values for viewport mode (when present). */
const VALID_VIEWPORT_MODES = new Set(['preset', 'custom']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

// ---------------------------------------------------------------------------
// Entry validation
// ---------------------------------------------------------------------------

function validateEntry(
  raw: unknown,
  entryIndex: number
): ProjectEntryData | string {
  if (!isObject(raw)) {
    return `entry[${entryIndex}]: expected object`;
  }

  // id
  if (!isNonEmptyString(raw['id'])) {
    return `entry[${entryIndex}]: missing or invalid "id"`;
  }
  const id = raw['id'];

  // orientation
  if (!isNonEmptyString(raw['orientation'])) {
    return `entry[${entryIndex}]: missing "orientation"`;
  }
  if (!VALID_ORIENTATIONS.has(raw['orientation'])) {
    return `entry[${entryIndex}]: invalid orientation "${raw['orientation']}"`;
  }
  const orientation = raw['orientation'];

  // viewportMode
  const viewportModeRaw = raw['viewportMode'];
  let viewportMode: string | undefined;
  if (viewportModeRaw !== undefined) {
    if (!isNonEmptyString(viewportModeRaw)) {
      return `entry[${entryIndex}]: invalid viewportMode type`;
    }
    if (!VALID_VIEWPORT_MODES.has(viewportModeRaw)) {
      return `entry[${entryIndex}]: unknown viewportMode "${viewportModeRaw}"`;
    }
    viewportMode = viewportModeRaw;
  }

  // deviceId
  if (!isNonEmptyString(raw['deviceId'])) {
    return `entry[${entryIndex}]: missing "deviceId"`;
  }
  const deviceId = raw['deviceId'];

  // --- Custom viewport identity (strict) ---
  if (viewportMode === 'custom') {
    // Custom mode requires the sentinel deviceId
    if (deviceId !== CUSTOM_DEVICE_ID) {
      return `entry[${entryIndex}]: viewportMode "custom" requires deviceId "${CUSTOM_DEVICE_ID}", got "${deviceId}"`;
    }

    // Custom width/height required, integer, in range
    if (!isInteger(raw['customViewportWidth'])) {
      return `entry[${entryIndex}]: missing or invalid customViewportWidth`;
    }
    if (
      (raw['customViewportWidth'] as number) < CUSTOM_VIEWPORT_MIN ||
      (raw['customViewportWidth'] as number) > CUSTOM_VIEWPORT_MAX
    ) {
      return `entry[${entryIndex}]: customViewportWidth out of range [${CUSTOM_VIEWPORT_MIN},${CUSTOM_VIEWPORT_MAX}]`;
    }

    if (!isInteger(raw['customViewportHeight'])) {
      return `entry[${entryIndex}]: missing or invalid customViewportHeight`;
    }
    if (
      (raw['customViewportHeight'] as number) < CUSTOM_VIEWPORT_MIN ||
      (raw['customViewportHeight'] as number) > CUSTOM_VIEWPORT_MAX
    ) {
      return `entry[${entryIndex}]: customViewportHeight out of range [${CUSTOM_VIEWPORT_MIN},${CUSTOM_VIEWPORT_MAX}]`;
    }
  } else {
    // --- Preset mode (default when viewportMode is omitted) ---

    // CUSTOM_DEVICE_ID is not valid for preset entries
    if (deviceId === CUSTOM_DEVICE_ID) {
      return `entry[${entryIndex}]: deviceId "${CUSTOM_DEVICE_ID}" is not valid in preset mode`;
    }

    // Must resolve in Device Registry
    if (!getDeviceById(deviceId)) {
      return `entry[${entryIndex}]: unknown deviceId "${deviceId}"`;
    }

    // Orientation must be supported by the device
    const device = getDeviceById(deviceId)!;
    if (
      !device.orientations.includes(orientation as 'portrait' | 'landscape')
    ) {
      return `entry[${entryIndex}]: orientation "${orientation}" not supported by device "${deviceId}"`;
    }
  }

  // Build the validated entry (extra fields tolerated)
  const entry: ProjectEntryData = {
    id,
    deviceId,
    orientation,
  };

  // Preserve optional fields if present
  if (isNonEmptyString(raw['customUrl'])) {
    (entry as { customUrl: string }).customUrl = raw['customUrl'];
  }
  if (viewportMode !== undefined) {
    (entry as { viewportMode: string }).viewportMode = viewportMode;
  }
  if (viewportMode === 'custom') {
    (entry as { customViewportWidth: number }).customViewportWidth = raw[
      'customViewportWidth'
    ] as number;
    (entry as { customViewportHeight: number }).customViewportHeight = raw[
      'customViewportHeight'
    ] as number;
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Full data validation
// ---------------------------------------------------------------------------

/**
 * Validate and normalize a raw `ProjectData` object.
 *
 * Normalizes in-memory only:
 * - `compareIds` stale/duplicate entries are dropped (order-preserving)
 * - `compareIds` non-array → []
 * - `layoutMode` "compare" with <2 valid compareIds → "grid" + []
 * - `activeId` stale/nonexistent → null
 * - extra fields tolerated
 *
 * Returns the normalized data or a rejection reason.
 */
export function validateProjectData(raw: unknown): Result<ProjectData> {
  if (!isObject(raw)) {
    return { ok: false, reason: 'data: expected object' };
  }

  // sharedUrl
  if (raw['sharedUrl'] !== undefined && typeof raw['sharedUrl'] !== 'string') {
    return { ok: false, reason: 'data.sharedUrl: expected string' };
  }
  const sharedUrl =
    typeof raw['sharedUrl'] === 'string' ? raw['sharedUrl'] : '';

  // entries
  if (!Array.isArray(raw['entries'])) {
    return { ok: false, reason: 'data.entries: expected array' };
  }
  const rawEntries = raw['entries'] as unknown[];
  const entries: ProjectEntryData[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawEntries.length; i++) {
    const result = validateEntry(rawEntries[i], i);
    if (typeof result === 'string') {
      return { ok: false, reason: result };
    }
    if (seenIds.has(result.id)) {
      return {
        ok: false,
        reason: `entry[${i}]: duplicate id "${result.id}"`,
      };
    }
    seenIds.add(result.id);
    entries.push(result);
  }

  // layoutMode
  const layoutModeRaw = raw['layoutMode'];
  let layoutMode: string;
  if (isNonEmptyString(layoutModeRaw)) {
    if (!VALID_LAYOUT_MODES.has(layoutModeRaw)) {
      return {
        ok: false,
        reason: `data.layoutMode: unknown "${layoutModeRaw}"`,
      };
    }
    layoutMode = layoutModeRaw;
  } else {
    layoutMode = 'grid';
  }

  // compareIds
  let compareIds: string[];
  if (Array.isArray(raw['compareIds'])) {
    const entryIdSet = new Set(entries.map((e) => e.id));
    const seen = new Set<string>();
    compareIds = [];
    for (const id of raw['compareIds'] as unknown[]) {
      if (typeof id === 'string' && entryIdSet.has(id) && !seen.has(id)) {
        compareIds.push(id);
        seen.add(id);
      }
    }
  } else {
    compareIds = [];
  }

  // If compare mode but <2 valid ids, downgrade to grid
  if (layoutMode === 'compare' && compareIds.length < 2) {
    layoutMode = 'grid';
    compareIds = [];
  }

  // activeId
  let activeId: string | null;
  const activeIdRaw = raw['activeId'];
  if (activeIdRaw === null || activeIdRaw === undefined) {
    activeId = null;
  } else if (typeof activeIdRaw === 'string') {
    const entryIdSet = new Set(entries.map((e) => e.id));
    activeId = entryIdSet.has(activeIdRaw) ? activeIdRaw : null;
  } else {
    return { ok: false, reason: 'data.activeId: expected string or null' };
  }

  return {
    ok: true,
    value: { sharedUrl, entries, layoutMode, compareIds, activeId },
  };
}

// ---------------------------------------------------------------------------
// Full record validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw persisted record (including meta).
 *
 * Meta rules:
 * - `schemaVersion` must be a positive integer (checked before calling here)
 * - `id` must be a non-empty string
 * - `meta.createdAt` / `meta.updatedAt` must be valid date strings → reject if missing/invalid
 * - `meta.name` missing/empty → normalize to "Untitled project" (display-only, no history)
 *
 * Timestamps are NEVER synthesized during validation.  Only a future
 * explicit migration may repair historical timestamps.
 */
export function validateRecord(raw: unknown): Result<ProjectData> {
  if (!isObject(raw)) {
    return { ok: false, reason: 'record: expected object' };
  }

  // id
  if (!isNonEmptyString(raw['id'])) {
    return { ok: false, reason: 'record.id: missing or not a string' };
  }

  // meta
  if (!isObject(raw['meta'])) {
    return { ok: false, reason: 'record.meta: expected object' };
  }
  const meta = raw['meta'] as Record<string, unknown>;

  // Timestamps: must exist and be valid ISO date strings
  if (!isValidDate(meta['createdAt'])) {
    return {
      ok: false,
      reason: 'record.meta.createdAt: missing or invalid date',
    };
  }
  if (!isValidDate(meta['updatedAt'])) {
    return {
      ok: false,
      reason: 'record.meta.updatedAt: missing or invalid date',
    };
  }

  // Name: normalize missing/empty to default (display-only, no history semantics)
  // This is applied in-memory only; repository never writes back without explicit save.
  if (
    !isNonEmptyString(meta['name']) ||
    (meta['name'] as string).trim() === ''
  ) {
    // Handled in normalization below
  }

  // data
  const dataResult = validateProjectData(raw['data']);
  if (!dataResult.ok) {
    return dataResult;
  }

  // Normalize name in-memory on the validated result
  // (applied by the repository when constructing the in-memory record)
  return dataResult.ok ? { ok: true, value: dataResult.value } : dataResult;
}

/**
 * Normalize a project name. Returns the trimmed name or the default
 * if missing/empty. Used by the repository when constructing the
 * in-memory record from validated data.
 */
export function normalizeName(rawName: unknown): string {
  if (isNonEmptyString(rawName) && rawName.trim() !== '') {
    return rawName.trim();
  }
  return DEFAULT_PROJECT_NAME;
}
