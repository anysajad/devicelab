import { describe, expect, it } from 'vitest';

import { createProjectRepository } from '../repository';
import { createMemoryAdapter } from '../storage';
import type { ProjectData, ProjectRecord } from '../types';
import { SCHEMA_VERSION } from '../schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<ProjectData>): ProjectData {
  return {
    sharedUrl: 'https://example.com',
    entries: [
      {
        id: 'preview-1',
        deviceId: 'iphone-15',
        orientation: 'portrait',
      },
    ],
    layoutMode: 'grid',
    compareIds: [],
    activeId: null,
    ...overrides,
  };
}

function makeRecord(overrides?: Partial<ProjectRecord>): ProjectRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'proj-test',
    meta: {
      name: 'Test Project',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    },
    data: makeData(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectRepository', () => {
  describe('create', () => {
    it('generates a unique id', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const r1 = repo.create(makeData());
      const r2 = repo.create(makeData());
      expect(r1.id).not.toBe(r2.id);
    });

    it('sets name from argument', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData(), 'My Project');
      expect(record.meta.name).toBe('My Project');
    });

    it('uses default name when not provided', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData());
      expect(record.meta.name).toBe('Untitled project');
    });

    it('generates createdAt and updatedAt as ISO strings', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData());
      expect(Number.isFinite(Date.parse(record.meta.createdAt))).toBe(true);
      expect(Number.isFinite(Date.parse(record.meta.updatedAt))).toBe(true);
    });

    it('sets both timestamps to the same value on create', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData());
      expect(record.meta.createdAt).toBe(record.meta.updatedAt);
    });

    it('persists the record so get returns it', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const created = repo.create(makeData(), 'Saved');
      const fetched = repo.get(created.id);
      expect(fetched.ok).toBe(true);
      if (fetched.ok) {
        expect(fetched.value.id).toBe(created.id);
        expect(fetched.value.meta.name).toBe('Saved');
      }
    });
  });

  describe('get', () => {
    it('returns not-found for missing id', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const r = repo.get('nonexistent');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not-found');
    });

    it('returns corrupted for invalid JSON', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem('devicelab.project.bad', '{invalid json');
      const repo = createProjectRepository(adapter);
      const r = repo.get('bad');
      expect(r.ok).toBe(false);
    });

    it('returns error for unsupported schema version', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem(
        'devicelab.project.old',
        JSON.stringify({ schemaVersion: 99, id: 'old', meta: {}, data: {} })
      );
      const repo = createProjectRepository(adapter);
      const r = repo.get('old');
      expect(r.ok).toBe(false);
    });

    it('returns error when timestamps are missing', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem(
        'devicelab.project.notime',
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          id: 'notime',
          meta: { name: 'No Time' },
          data: makeData(),
        })
      );
      const repo = createProjectRepository(adapter);
      const r = repo.get('notime');
      expect(r.ok).toBe(false);
    });

    it('normalizes missing name to default', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem(
        'devicelab.project.noname',
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          id: 'noname',
          meta: {
            name: '',
            createdAt: '2026-09-05T12:00:00.000Z',
            updatedAt: '2026-09-05T12:00:00.000Z',
          },
          data: makeData(),
        })
      );
      const repo = createProjectRepository(adapter);
      const r = repo.get('noname');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.meta.name).toBe('Untitled project');
    });
  });

  describe('save', () => {
    it('preserves createdAt from existing record', () => {
      const adapter = createMemoryAdapter();
      const repo = createProjectRepository(adapter);
      const fixedCreatedAt = '2025-01-01T00:00:00.000Z';

      // Seed the adapter directly with a known record
      const original = makeRecord({ id: 'seeded' });
      adapter.setItem(
        'devicelab.project.seeded',
        JSON.stringify({
          ...original,
          meta: { ...original.meta, createdAt: fixedCreatedAt },
        })
      );

      const saved = {
        ...original,
        meta: { ...original.meta, createdAt: fixedCreatedAt },
        data: { ...original.data, sharedUrl: 'https://changed.com' },
      };
      repo.save(saved);

      const fetched = repo.get('seeded');
      expect(fetched.ok).toBe(true);
      if (fetched.ok) {
        expect(fetched.value.meta.createdAt).toBe(fixedCreatedAt);
        expect(fetched.value.data.sharedUrl).toBe('https://changed.com');
      }
    });

    it('creates if record does not yet exist', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = makeRecord({ id: 'new-id' });
      repo.save(record);
      const fetched = repo.get('new-id');
      expect(fetched.ok).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes a record', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData());
      repo.remove(record.id);
      expect(repo.get(record.id).ok).toBe(false);
    });

    it('removing nonexistent id is a no-op', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      expect(() => repo.remove('nonexistent')).not.toThrow();
    });

    it('clears lastOpened pointer if removing the last-opened project', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const record = repo.create(makeData());
      repo.setLastOpened(record.id);
      repo.remove(record.id);
      expect(repo.getLastOpened()).toBeNull();
    });
  });

  describe('list', () => {
    it('lists all projects', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      repo.create(makeData(), 'A');
      repo.create(makeData(), 'B');
      const list = repo.list();
      expect(list).toHaveLength(2);
    });

    it('returns summaries sorted by createdAt descending', () => {
      const adapter = createMemoryAdapter();
      const repo = createProjectRepository(adapter);

      // Seed two records with known different timestamps
      adapter.setItem(
        'devicelab.project.first',
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          id: 'first',
          meta: {
            name: 'First',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          data: makeData(),
        })
      );
      adapter.setItem(
        'devicelab.project.second',
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          id: 'second',
          meta: {
            name: 'Second',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          data: makeData(),
        })
      );

      const list = repo.list();
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe('Second');
      expect(list[1]!.name).toBe('First');
    });

    it('skips corrupted records', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem('devicelab.project.corrupt', '{bad json');
      const repo = createProjectRepository(adapter);
      repo.create(makeData(), 'Good');
      const list = repo.list();
      expect(list).toHaveLength(1);
    });
  });

  describe('lastOpened', () => {
    it('returns null when no lastOpened is set', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      expect(repo.getLastOpened()).toBeNull();
    });

    it('sets and gets the lastOpened pointer', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      repo.setLastOpened('proj-1');
      expect(repo.getLastOpened()).toBe('proj-1');
    });

    it('clears the pointer with null', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      repo.setLastOpened('proj-1');
      repo.setLastOpened(null);
      expect(repo.getLastOpened()).toBeNull();
    });

    it('getLastOpenedRecord returns null when no pointer', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      expect(repo.getLastOpenedRecord()).toBeNull();
    });

    it('getLastOpenedRecord returns error when project is corrupted', () => {
      const adapter = createMemoryAdapter();
      adapter.setItem('devicelab.lastProject', JSON.stringify('corrupt'));
      adapter.setItem('devicelab.project.corrupt', '{bad');
      const repo = createProjectRepository(adapter);
      const r = repo.getLastOpenedRecord();
      expect(r).not.toBeNull();
      if (r) expect(r.ok).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('create → get → data preserved', () => {
      const repo = createProjectRepository(createMemoryAdapter());
      const data = makeData({
        sharedUrl: 'https://test.com',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
          { id: 'preview-2', deviceId: 'ipad', orientation: 'landscape' },
        ],
        layoutMode: 'focus',
        activeId: 'preview-2',
      });
      const created = repo.create(data, 'Round Trip');
      const fetched = repo.get(created.id);
      expect(fetched.ok).toBe(true);
      if (fetched.ok) {
        expect(fetched.value.data.sharedUrl).toBe('https://test.com');
        expect(fetched.value.data.entries).toHaveLength(2);
        expect(fetched.value.data.layoutMode).toBe('focus');
        expect(fetched.value.data.activeId).toBe('preview-2');
        expect(fetched.value.meta.name).toBe('Round Trip');
      }
    });
  });
});
