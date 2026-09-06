/**
 * Project persistence types.
 *
 * These types model the versioned, serializable workspace configuration
 * that is persisted to browser storage and restored on app boot.
 *
 * Runtime-only state (zoom, inspection, lifecycle, controllers, iframes)
 * is deliberately excluded.
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/** Current persisted schema version. Increment on every breaking data change. */
export type ProjectSchemaVersion = number;

// ---------------------------------------------------------------------------
// Per-entry persisted shape
// ---------------------------------------------------------------------------

/** Persisted representation of a single preview entry. */
export interface ProjectEntryData {
  readonly id: string;
  readonly deviceId: string;
  readonly orientation: string;
  readonly customUrl?: string;
  readonly viewportMode?: string;
  readonly customViewportWidth?: number;
  readonly customViewportHeight?: number;
}

// ---------------------------------------------------------------------------
// Workspace data (everything that survives a page reload)
// ---------------------------------------------------------------------------

/** Serializable workspace configuration. */
export interface ProjectData {
  readonly sharedUrl: string;
  readonly entries: readonly ProjectEntryData[];
  readonly layoutMode: string;
  readonly compareIds: readonly string[];
  readonly activeId: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Timestamps and display name associated with a project. */
export interface ProjectMeta {
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Full record (what lands in localStorage)
// ---------------------------------------------------------------------------

/** Complete persisted project record. */
export interface ProjectRecord {
  readonly schemaVersion: ProjectSchemaVersion;
  readonly id: string;
  readonly meta: ProjectMeta;
  readonly data: ProjectData;
}

// ---------------------------------------------------------------------------
// Lightweight summary (for list views)
// ---------------------------------------------------------------------------

/** Project metadata without the full data payload. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Result helpers (dependency-free discriminated unions)
// ---------------------------------------------------------------------------

/** Successful result carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failure result carrying a reason string. */
export interface Err {
  readonly ok: false;
  readonly reason: string;
}

/** Result of an operation that may succeed or fail with a reason. */
export type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Storage adapter abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal key-value storage abstraction.
 *
 * The ProjectRepository depends on this interface, not on localStorage
 * directly. A future IndexedDB / backend implementation replaces this
 * one file while the repository stays unchanged.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  /** Returns true if the write succeeded, false on quota/security errors. */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  keys(prefix: string): string[];
}

// ---------------------------------------------------------------------------
// Hydration payload (what the store receives)
// ---------------------------------------------------------------------------

/** Shape the Zustand store accepts during hydration. */
export interface HydratePayload {
  readonly sharedUrl: string;
  readonly entries: readonly ProjectEntryData[];
  readonly layoutMode: string;
  readonly compareIds: readonly string[];
  readonly activeId: string | null;
}
