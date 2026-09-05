/**
 * Projects persistence subsystem — public API.
 */

export {
  SCHEMA_VERSION,
  createProjectMeta,
  DEFAULT_PROJECT_NAME,
} from './schema';
export { migrateRecord } from './schema';
export {
  validateRecord,
  validateProjectData,
  normalizeName,
} from './validator';
export {
  toProjectData,
  toHydratePayload,
  buildProjectRecord,
} from './serializer';
export {
  createLocalStorageAdapter,
  createMemoryAdapter,
  PROJECT_KEY_PREFIX,
  LAST_PROJECT_KEY,
} from './storage';
export { createProjectRepository } from './repository';
export { restoreLastProject } from './bootstrap';
export type {
  ProjectSchemaVersion,
  ProjectMeta,
  ProjectData,
  ProjectEntryData,
  ProjectRecord,
  ProjectSummary,
  HydratePayload,
  StorageAdapter,
  Result,
  Ok,
  Err,
} from './types';
export type { ProjectRepository } from './repository';
