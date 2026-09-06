/**
 * ProjectRepository — the abstraction over storage.
 *
 * Future IndexedDB / backend implementations replace this module's
 * storage backend while the UI and store continue depending on the
 * same interface.
 *
 * Responsibilities:
 * - CRUD for ProjectRecords
 * - JSON parse/stringify of stored records
 * - Validation and normalization on read (never on write path)
 * - Last-opened pointer (used by bootstrap)
 * - Reads/lists never mutate persisted records
 */

import type {
  ProjectData,
  ProjectRecord,
  ProjectSummary,
  Result,
} from './types';
import type { StorageAdapter } from './types';
import { LAST_PROJECT_KEY, PROJECT_KEY_PREFIX } from './storage';
import { createProjectMeta, migrateRecord } from './schema';
import { validateProjectData, normalizeName } from './validator';
import { buildProjectRecord } from './serializer';

// ---------------------------------------------------------------------------
// Helper: generate a UUID (browser-native, no dependencies)
// ---------------------------------------------------------------------------

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for non-secure contexts (e.g., HTTP)
    return (
      'proj-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 10)
    );
  }
}

// ---------------------------------------------------------------------------
// Record validation pipeline (reused by repository and import)
// ---------------------------------------------------------------------------

/**
 * Validate a raw record through the full migration + validation pipeline.
 *
 * Handles: migration, timestamp validation, data validation, name normalization.
 * Returns a fully validated ProjectRecord or a rejection reason.
 *
 * This is the single source of truth for record validation, used by both
 * the repository read path and the import parser.
 */
export function parseAndValidateRecord(
  raw: Record<string, unknown>
): Result<ProjectRecord> {
  // Migration check
  const migrated = migrateRecord(raw);
  if (migrated === null) {
    return {
      ok: false,
      reason: 'unsupported-schema-version or corrupted record',
    };
  }

  // Validate meta timestamps (must be valid ISO date strings)
  const { createdAt, updatedAt } = migrated.meta;
  if (
    typeof createdAt !== 'string' ||
    createdAt.trim() === '' ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return { ok: false, reason: 'meta.createdAt: missing or invalid date' };
  }
  if (
    typeof updatedAt !== 'string' ||
    updatedAt.trim() === '' ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return { ok: false, reason: 'meta.updatedAt: missing or invalid date' };
  }

  // Validate the data portion
  const dataResult = validateProjectData(migrated.data);
  if (!dataResult.ok) {
    return { ok: false, reason: `data validation: ${dataResult.reason}` };
  }

  // Reconstruct the record with validated data and normalized name
  const normalizedName = normalizeName(migrated.meta.name);
  const record: ProjectRecord = {
    schemaVersion: migrated.schemaVersion,
    id: migrated.id,
    meta: {
      name: normalizedName,
      createdAt,
      updatedAt,
    },
    data: dataResult.value,
  };

  return { ok: true, value: record };
}

// ---------------------------------------------------------------------------
// ProjectRepository
// ---------------------------------------------------------------------------

export interface ProjectRepository {
  /** List all projects (summary only, no data). */
  list(): ProjectSummary[];
  /** Get a full record by ID. Returns error for corrupted/unsupported records. */
  get(id: string): Result<ProjectRecord>;
  /** Create a new project with initial data. Returns failure if storage write fails. */
  create(data: ProjectData, name?: string): Result<ProjectRecord>;
  /** Save (overwrite) an existing record. Returns true on success. Preserves createdAt, bumps updatedAt. */
  save(record: ProjectRecord): boolean;
  /** Remove a project by ID. No-op if missing. */
  remove(id: string): void;
  /** Get the last-opened project ID, or null. */
  getLastOpened(): string | null;
  /** Set the last-opened project ID. */
  setLastOpened(id: string | null): void;
  /** Get the full record for the last-opened project, or null. */
  getLastOpenedRecord(): Result<ProjectRecord> | null;
}

/**
 * Create a ProjectRepository backed by the given StorageAdapter.
 */
export function createProjectRepository(
  storage: StorageAdapter
): ProjectRepository {
  function recordKey(id: string): string {
    return `${PROJECT_KEY_PREFIX}${id}`;
  }

  function readRaw(id: string): Record<string, unknown> | null {
    const raw = storage.getItem(recordKey(id));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function parseAndValidate(id: string): Result<ProjectRecord> {
    const raw = readRaw(id);
    if (raw === null) {
      return { ok: false, reason: 'not-found' };
    }

    return parseAndValidateRecord(raw);
  }

  return {
    list(): ProjectSummary[] {
      const keys = storage.keys(PROJECT_KEY_PREFIX);
      const summaries: ProjectSummary[] = [];

      for (const key of keys) {
        const raw = storage.getItem(key);
        if (raw === null) continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (
            typeof parsed['id'] === 'string' &&
            parsed['meta'] !== null &&
            typeof parsed['meta'] === 'object'
          ) {
            const meta = parsed['meta'] as Record<string, unknown>;
            summaries.push({
              id: parsed['id'] as string,
              name: normalizeName(meta['name']),
              createdAt: meta['createdAt'] as string,
              updatedAt: meta['updatedAt'] as string,
            });
          }
        } catch {
          // Corrupted record — skip silently in list view
        }
      }

      return summaries.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },

    get(id: string): Result<ProjectRecord> {
      return parseAndValidate(id);
    },

    create(data: ProjectData, name?: string): Result<ProjectRecord> {
      const id = generateId();
      const meta = createProjectMeta(name);
      const record = buildProjectRecord(id, data, meta);
      const persisted = storage.setItem(recordKey(id), JSON.stringify(record));
      if (!persisted) {
        return { ok: false, reason: 'storage write failed' };
      }
      return { ok: true, value: record };
    },

    save(record: ProjectRecord): boolean {
      // Preserve original createdAt from the persisted record (if it exists)
      const existing = readRaw(record.id);
      let createdAt = record.meta.createdAt;

      if (existing !== null) {
        const existingMeta = existing['meta'] as
          Record<string, unknown> | undefined;
        if (
          existingMeta &&
          typeof existingMeta['createdAt'] === 'string' &&
          isValidDateString(existingMeta['createdAt'] as string)
        ) {
          createdAt = existingMeta['createdAt'] as string;
        }
      }

      const savedRecord: ProjectRecord = {
        ...record,
        meta: {
          ...record.meta,
          createdAt,
          updatedAt: new Date().toISOString(),
        },
      };
      return storage.setItem(recordKey(record.id), JSON.stringify(savedRecord));
    },

    remove(id: string): void {
      storage.removeItem(recordKey(id));
      // If this was the last-opened, clear the pointer
      if (storage.getItem(LAST_PROJECT_KEY) === id) {
        storage.removeItem(LAST_PROJECT_KEY);
      }
    },

    getLastOpened(): string | null {
      const raw = storage.getItem(LAST_PROJECT_KEY);
      if (raw === null) return null;
      // Accept both JSON-stringified strings and plain strings
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'string' ? parsed : null;
      } catch {
        // Plain string fallback
        return raw || null;
      }
    },

    setLastOpened(id: string | null): void {
      if (id === null) {
        storage.removeItem(LAST_PROJECT_KEY);
      } else {
        storage.setItem(LAST_PROJECT_KEY, id);
      }
    },

    getLastOpenedRecord(): Result<ProjectRecord> | null {
      const id = this.getLastOpened();
      if (id === null) return null;
      const result = this.get(id);
      if (!result.ok) {
        return result;
      }
      return { ok: true, value: result.value };
    },
  };
}

function isValidDateString(s: string): boolean {
  if (s.trim() === '') return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}
