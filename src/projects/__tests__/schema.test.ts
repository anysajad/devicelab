import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  createProjectMeta,
  DEFAULT_PROJECT_NAME,
  migrateRecord,
} from '../schema';

describe('schema', () => {
  describe('SCHEMA_VERSION', () => {
    it('is a positive integer', () => {
      expect(typeof SCHEMA_VERSION).toBe('number');
      expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    });

    it('equals 1', () => {
      expect(SCHEMA_VERSION).toBe(1);
    });
  });

  describe('createProjectMeta', () => {
    it('generates createdAt and updatedAt as ISO strings', () => {
      const meta = createProjectMeta('Test');
      expect(typeof meta.createdAt).toBe('string');
      expect(typeof meta.updatedAt).toBe('string');
      expect(Number.isFinite(Date.parse(meta.createdAt))).toBe(true);
      expect(Number.isFinite(Date.parse(meta.updatedAt))).toBe(true);
    });

    it('sets both timestamps to the same value', () => {
      const meta = createProjectMeta('Test');
      expect(meta.createdAt).toBe(meta.updatedAt);
    });

    it('uses provided name when non-empty', () => {
      const meta = createProjectMeta('My Project');
      expect(meta.name).toBe('My Project');
    });

    it('normalizes whitespace-only name to default', () => {
      const meta = createProjectMeta('   ');
      expect(meta.name).toBe(DEFAULT_PROJECT_NAME);
    });

    it('uses default name when undefined', () => {
      const meta = createProjectMeta();
      expect(meta.name).toBe(DEFAULT_PROJECT_NAME);
    });

    it('uses default name when empty string', () => {
      const meta = createProjectMeta('');
      expect(meta.name).toBe(DEFAULT_PROJECT_NAME);
    });
  });

  describe('DEFAULT_PROJECT_NAME', () => {
    it('is a non-empty string', () => {
      expect(typeof DEFAULT_PROJECT_NAME).toBe('string');
      expect(DEFAULT_PROJECT_NAME.length).toBeGreaterThan(0);
    });
  });

  describe('migrateRecord', () => {
    it('returns null for non-object input', () => {
      expect(
        migrateRecord(null as unknown as Record<string, unknown>)
      ).toBeNull();
      expect(
        migrateRecord('string' as unknown as Record<string, unknown>)
      ).toBeNull();
    });

    it('returns null for missing schemaVersion', () => {
      expect(migrateRecord({})).toBeNull();
    });

    it('returns null for non-numeric schemaVersion', () => {
      expect(migrateRecord({ schemaVersion: 'abc' })).toBeNull();
    });

    it('returns null for negative schemaVersion', () => {
      expect(migrateRecord({ schemaVersion: -1 })).toBeNull();
    });

    it('returns identity for current version', () => {
      const record = { schemaVersion: 1, id: 'test', meta: {}, data: {} };
      const result = migrateRecord(record);
      expect(result).toEqual(record);
    });

    it('returns null for future version with no migration path', () => {
      expect(migrateRecord({ schemaVersion: 99 })).toBeNull();
    });
  });
});
