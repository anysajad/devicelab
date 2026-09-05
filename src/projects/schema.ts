/**
 * Schema version, metadata creation, and migration registry.
 *
 * Responsibilities:
 * - Expose SCHEMA_VERSION (current = 1)
 * - createProjectMeta: used only at project creation (generates timestamps)
 * - migrateRecord: dispatch per-version migration; unknown versions rejected
 *
 * IMPORTANT: The validator never synthesizes timestamps or calls
 * createProjectMeta. Migration is the only path that may repair
 * historical timestamps.
 */

import type { ProjectMeta, ProjectRecord, ProjectSchemaVersion } from './types';

/** Current persisted schema version. */
export const SCHEMA_VERSION: ProjectSchemaVersion = 1;

/** The default project name used when a user-provided name is missing. */
export const DEFAULT_PROJECT_NAME = 'Untitled project';

/**
 * Create fresh metadata for a brand-new project.
 *
 * Generates `createdAt` and `updatedAt` set to the current instant.
 * This is the ONLY place that creates new timestamps.  The validator
 * and repository never call this for existing persisted records.
 */
export function createProjectMeta(name?: string): ProjectMeta {
  const now = new Date().toISOString();
  return {
    name: name?.trim() || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Per-version migration function.
 *
 * Receives a raw record and must return a record whose shape satisfies
 * the CURRENT schema version.  Migration functions MUST NOT be identity
 * for versions they don't handle — the dispatcher skips them.
 */
type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

/** Registry of per-version migration functions. */
const MIGRATIONS: Record<number, Migration> = {};

/**
 * Register a migration for a given version.
 *
 * Example (for a future v2 → v3 migration):
 * ```
 * registerMigration(2, (record) => { ... return record; });
 * ```
 */
export function registerMigration(
  version: ProjectSchemaVersion,
  fn: Migration
): void {
  MIGRATIONS[version] = fn;
}

/**
 * Migrate a raw record to the current schema version.
 *
 * - If `record.schemaVersion === SCHEMA_VERSION` → identity (no migration).
 * - If a migration exists for `record.schemaVersion + 1` → apply it and
 *   continue stepping forward until `record.schemaVersion === SCHEMA_VERSION`.
 * - If `record.schemaVersion > SCHEMA_VERSION` or no migration path exists
 *   for a missing step → reject.
 *
 * The returned record always carries `schemaVersion: SCHEMA_VERSION`.
 */
export function migrateRecord(
  record: Record<string, unknown>
): ProjectRecord | null {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return null;
  }
  const rawVersion = record['schemaVersion'];

  if (typeof rawVersion !== 'number' || rawVersion < 1) {
    return null;
  }

  let current: Record<string, unknown> = { ...record };

  while ((current['schemaVersion'] as number) < SCHEMA_VERSION) {
    const ver = current['schemaVersion'] as number;
    const migration = MIGRATIONS[ver];
    if (!migration) {
      return null;
    }
    current = migration(current);
    // Ensure migration bumped the version
    if (
      typeof current['schemaVersion'] !== 'number' ||
      (current['schemaVersion'] as number) !== ver + 1
    ) {
      return null;
    }
  }

  if ((current['schemaVersion'] as number) !== SCHEMA_VERSION) {
    return null;
  }

  return current as unknown as ProjectRecord;
}
