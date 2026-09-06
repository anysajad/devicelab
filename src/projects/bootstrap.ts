/**
 * Bootstrap: restore the last-opened project synchronously before
 * React renders.
 *
 * Called from main.tsx BEFORE createRoot().render().
 *
 * - Reads devicelab.lastProject from localStorage
 * - If valid and supportable → hydrates the preview store
 * - If missing/corrupted/unsupported → silent no-op (empty workspace)
 * - Storage failures never prevent the app from booting
 * - Returns the booted project info for the manager store, or null
 */

import type { ProjectData } from './types';
import { usePreviewStore } from '../preview/store/usePreviewStore';
import { normalizeName } from './validator';
import { toHydratePayload } from './serializer';
import { validateProjectData } from './validator';
import { migrateRecord } from './schema';
import {
  createLocalStorageAdapter,
  LAST_PROJECT_KEY,
  PROJECT_KEY_PREFIX,
} from './storage';

/** Default storage instance for bootstrap. */
const defaultStorage = createLocalStorageAdapter();

/** Information about the project restored from storage. */
export interface BootedProject {
  readonly id: string;
  readonly name: string;
  readonly data: ProjectData;
}

/**
 * Restore the last project from localStorage.
 *
 * Synchronous. Must not throw.
 * Must be called before React renders.
 *
 * Returns booted project info so the project manager can reflect the
 * exact workspace state without independently reconstructing it.
 */
export function restoreLastProject(): BootedProject | null {
  try {
    // Read the last-opened pointer
    const rawPointer = defaultStorage.getItem(LAST_PROJECT_KEY);
    if (rawPointer === null) return null;

    let projectId: string;
    try {
      const parsed = JSON.parse(rawPointer);
      if (typeof parsed === 'string') {
        projectId = parsed;
      } else {
        // Plain string fallback (repo.setLastOpened writes plain strings)
        projectId = rawPointer;
      }
    } catch {
      // Not JSON — treat as a plain string ID
      projectId = rawPointer;
    }

    // Read the project record
    const rawRecord = defaultStorage.getItem(
      `${PROJECT_KEY_PREFIX}${projectId}`
    );
    if (rawRecord === null) return null;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(rawRecord) as Record<string, unknown>;
    } catch {
      return null;
    }

    // Migrate if needed
    const migrated = migrateRecord(record);
    if (migrated === null) return null;

    // Validate timestamps (reject if missing/invalid)
    const { createdAt, updatedAt } = migrated.meta;
    if (
      typeof createdAt !== 'string' ||
      createdAt.trim() === '' ||
      !Number.isFinite(Date.parse(createdAt))
    ) {
      return null;
    }
    if (
      typeof updatedAt !== 'string' ||
      updatedAt.trim() === '' ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return null;
    }

    // Validate the data
    const dataResult = validateProjectData(migrated.data);
    if (!dataResult.ok) return null;

    const data = dataResult.value;

    // Hydrate the store
    const payload = toHydratePayload(data);
    usePreviewStore.getState().hydrate(payload);

    return {
      id: projectId,
      name: normalizeName(migrated.meta.name),
      data,
    };
  } catch {
    // Any unexpected error — silent no-op
    return null;
  }
}
