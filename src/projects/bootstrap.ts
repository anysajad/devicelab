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
 */

import { usePreviewStore } from '../preview/store/usePreviewStore';
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

/**
 * Restore the last project from localStorage.
 *
 * Synchronous. Must not throw.
 * Must be called before React renders.
 */
export function restoreLastProject(): void {
  try {
    // Read the last-opened pointer
    const rawPointer = defaultStorage.getItem(LAST_PROJECT_KEY);
    if (rawPointer === null) return;

    let projectId: string;
    try {
      const parsed = JSON.parse(rawPointer);
      if (typeof parsed !== 'string') return;
      projectId = parsed;
    } catch {
      return;
    }

    // Read the project record
    const rawRecord = defaultStorage.getItem(
      `${PROJECT_KEY_PREFIX}${projectId}`
    );
    if (rawRecord === null) return;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(rawRecord) as Record<string, unknown>;
    } catch {
      return;
    }

    // Migrate if needed
    const migrated = migrateRecord(record);
    if (migrated === null) return;

    // Validate timestamps (reject if missing/invalid)
    const { createdAt, updatedAt } = migrated.meta;
    if (
      typeof createdAt !== 'string' ||
      createdAt.trim() === '' ||
      !Number.isFinite(Date.parse(createdAt))
    ) {
      return;
    }
    if (
      typeof updatedAt !== 'string' ||
      updatedAt.trim() === '' ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return;
    }

    // Validate the data
    const dataResult = validateProjectData(migrated.data);
    if (!dataResult.ok) return;

    // Hydrate the store
    const payload = toHydratePayload(dataResult.value);
    usePreviewStore.getState().hydrate(payload);
  } catch {
    // Any unexpected error — silent no-op
  }
}
