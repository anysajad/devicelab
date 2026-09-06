/**
 * Dirty-state derivation for the project manager.
 *
 * Uses deterministic serialization via toProjectData() to compare
 * the current workspace against a saved baseline. Runtime-only state
 * (lifecycle, inspection, zoom, tools) is excluded by construction.
 */

import type { ProjectData } from '../types';

/** Canonical empty workspace baseline for unsaved (no-project) state. */
export const EMPTY_PROJECT_DATA: ProjectData = {
  sharedUrl: '',
  entries: [],
  layoutMode: 'grid',
  compareIds: [],
  activeId: null,
};

// ---------------------------------------------------------------------------
// Deep equality for ProjectData (dependency-free, small objects)
// ---------------------------------------------------------------------------

function entriesEqual(
  a: readonly ProjectData['entries'][number][],
  b: readonly ProjectData['entries'][number][]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ea = a[i]!;
    const eb = b[i]!;
    if (ea.id !== eb.id) return false;
    if (ea.deviceId !== eb.deviceId) return false;
    if (ea.orientation !== eb.orientation) return false;
    if ((ea.customUrl ?? '') !== (eb.customUrl ?? '')) return false;
    if ((ea.viewportMode ?? '') !== (eb.viewportMode ?? '')) return false;
    if ((ea.customViewportWidth ?? 0) !== (eb.customViewportWidth ?? 0))
      return false;
    if ((ea.customViewportHeight ?? 0) !== (eb.customViewportHeight ?? 0))
      return false;
  }
  return true;
}

function compareIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Deterministic deep equality for two ProjectData values.
 * Compares all persisted fields in stable order.
 */
export function projectDataEqual(a: ProjectData, b: ProjectData): boolean {
  return (
    a.sharedUrl === b.sharedUrl &&
    a.layoutMode === b.layoutMode &&
    a.activeId === b.activeId &&
    entriesEqual(a.entries, b.entries) &&
    compareIdsEqual(a.compareIds, b.compareIds)
  );
}

// ---------------------------------------------------------------------------
// Dirty derivation
// ---------------------------------------------------------------------------

/**
 * Compute whether the workspace is dirty.
 *
 * @param currentData - Current workspace serialized via toProjectData()
 * @param savedData   - Last persisted snapshot (null = never saved / new project)
 * @param name        - Current project name (from manager store)
 * @param savedName   - Last persisted project name (null = never saved)
 */
export function computeDirty(
  currentData: ProjectData,
  savedData: ProjectData | null,
  name: string,
  savedName: string | null
): boolean {
  const baseline = savedData ?? EMPTY_PROJECT_DATA;

  // Data or name changed
  return (
    !projectDataEqual(currentData, baseline) ||
    (savedName !== null && name !== savedName)
  );
}
