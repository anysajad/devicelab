/**
 * Pure serialization/deserialization boundary between the runtime
 * Zustand preview store and the persisted ProjectData.
 *
 * These functions are deterministic and have no side effects.
 * Runtime-only state (lifecycle, inspection, zoom, tools, nextId)
 * is never serialized.
 */

import type { PreviewCollectionState } from '../preview/store/usePreviewStore';

import type {
  HydratePayload,
  ProjectData,
  ProjectEntryData,
  ProjectRecord,
} from './types';

/**
 * Extract only the serializable fields from a collection state.
 *
 * Deterministic: same state → same output object shape and key order.
 */
export function toProjectData(state: PreviewCollectionState): ProjectData {
  return {
    sharedUrl: state.sharedUrl,
    entries: state.entries.map(toEntryData),
    layoutMode: state.layoutMode,
    compareIds: [...state.compareIds],
    activeId: state.activeId,
  };
}

/**
 * Serialize a single PreviewEntry to a persistable form.
 */
function toEntryData(entry: {
  id: string;
  deviceId: string;
  orientation: string;
  customUrl?: string;
  viewportMode?: string;
  customViewportWidth?: number;
  customViewportHeight?: number;
}): ProjectEntryData {
  const data: ProjectEntryData = {
    id: entry.id,
    deviceId: entry.deviceId,
    orientation: entry.orientation,
  };

  if (entry.customUrl !== undefined) {
    (data as { customUrl: string }).customUrl = entry.customUrl;
  }
  if (entry.viewportMode !== undefined) {
    (data as { viewportMode: string }).viewportMode = entry.viewportMode;
  }
  if (entry.customViewportWidth !== undefined) {
    (data as { customViewportWidth: number }).customViewportWidth =
      entry.customViewportWidth;
  }
  if (entry.customViewportHeight !== undefined) {
    (data as { customViewportHeight: number }).customViewportHeight =
      entry.customViewportHeight;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Deserialization: ProjectData → HydratePayload
// ---------------------------------------------------------------------------

/**
 * Convert persisted data into the shape the Zustand store's hydrate
 * action expects.  Runtime-only state will be reconstructed from the
 * initial controller setup when PreviewInstances mount.
 */
export function toHydratePayload(data: ProjectData): HydratePayload {
  return {
    sharedUrl: data.sharedUrl,
    entries: data.entries.map((e) => ({ ...e })),
    layoutMode: data.layoutMode,
    compareIds: [...data.compareIds],
    activeId: data.activeId,
  };
}

// ---------------------------------------------------------------------------
// Record construction (used by the repository on create)
// ---------------------------------------------------------------------------

/**
 * Build a complete ProjectRecord from validated data and meta.
 * Does NOT persist — that's the repository's job.
 */
export function buildProjectRecord(
  id: string,
  data: ProjectData,
  meta: { name: string; createdAt: string; updatedAt: string }
): ProjectRecord {
  return {
    schemaVersion: 1,
    id,
    meta: { ...meta },
    data: {
      sharedUrl: data.sharedUrl,
      entries: data.entries.map((e) => ({ ...e })),
      layoutMode: data.layoutMode,
      compareIds: [...data.compareIds],
      activeId: data.activeId,
    },
  };
}
