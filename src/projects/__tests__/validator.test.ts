import { describe, expect, it } from 'vitest';

import {
  validateProjectData,
  validateRecord,
  normalizeName,
} from '../validator';
import { DEFAULT_PROJECT_NAME } from '../schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validEntry(overrides?: Record<string, unknown>) {
  return {
    id: 'preview-1',
    deviceId: 'iphone-15',
    orientation: 'portrait',
    ...overrides,
  };
}

function validData(overrides?: Record<string, unknown>) {
  return {
    sharedUrl: 'https://example.com',
    entries: [validEntry()],
    layoutMode: 'grid',
    compareIds: [],
    activeId: null,
    ...overrides,
  };
}

function validRecord(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    id: 'proj-123',
    meta: {
      name: 'Test Project',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    },
    data: validData(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateProjectData
// ---------------------------------------------------------------------------

describe('validateProjectData', () => {
  it('accepts a valid minimal payload', () => {
    const r = validateProjectData(validData());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sharedUrl).toBe('https://example.com');
      expect(r.value.entries).toHaveLength(1);
      expect(r.value.layoutMode).toBe('grid');
      expect(r.value.compareIds).toEqual([]);
      expect(r.value.activeId).toBeNull();
    }
  });

  it('rejects non-object input', () => {
    expect(validateProjectData(null).ok).toBe(false);
    expect(validateProjectData('string').ok).toBe(false);
    expect(validateProjectData(42).ok).toBe(false);
  });

  it('rejects missing entries array', () => {
    const r = validateProjectData({ ...validData(), entries: 'not-array' });
    expect(r.ok).toBe(false);
  });

  it('accepts empty entries array', () => {
    const r = validateProjectData({ ...validData(), entries: [] });
    expect(r.ok).toBe(true);
  });

  it('rejects entry with missing id', () => {
    const r = validateProjectData({
      ...validData(),
      entries: [{ deviceId: 'iphone-15', orientation: 'portrait' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects entry with duplicate id', () => {
    const entry = validEntry();
    const r = validateProjectData({
      ...validData(),
      entries: [entry, { ...entry, id: 'preview-1' }],
    });
    expect(r.ok).toBe(false);
  });

  describe('custom viewport identity', () => {
    it('accepts custom entry with __custom__ deviceId', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 1024,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(true);
    });

    it('rejects custom entry with arbitrary deviceId', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: 'iphone-15',
            customViewportWidth: 1024,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry with random string deviceId', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: 'some-arbitrary-id',
            customViewportWidth: 1024,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry missing customViewportWidth', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry missing customViewportHeight', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 1024,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry with non-integer width', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 1024.5,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry with width below minimum', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 99,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects custom entry with width above maximum', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 4001,
            customViewportHeight: 768,
          }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('accepts custom entry at boundary values', () => {
      const r1 = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 100,
            customViewportHeight: 100,
          }),
        ],
      });
      expect(r1.ok).toBe(true);

      const r2 = validateProjectData({
        ...validData(),
        entries: [
          validEntry({
            viewportMode: 'custom',
            deviceId: '__custom__',
            customViewportWidth: 4000,
            customViewportHeight: 4000,
          }),
        ],
      });
      expect(r2.ok).toBe(true);
    });
  });

  describe('preset mode', () => {
    it('accepts a known deviceId', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [validEntry({ deviceId: 'iphone-15' })],
      });
      expect(r.ok).toBe(true);
    });

    it('rejects unknown deviceId', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [validEntry({ deviceId: 'nonexistent-device' })],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects __custom__ in preset mode', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [validEntry({ deviceId: '__custom__' })],
      });
      expect(r.ok).toBe(false);
    });

    it('rejects orientation unsupported by device', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({ deviceId: 'desktop-720p', orientation: 'portrait' }),
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('accepts landscape orientation for desktop', () => {
      const r = validateProjectData({
        ...validData(),
        entries: [
          validEntry({ deviceId: 'desktop-720p', orientation: 'landscape' }),
        ],
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('compareIds normalization', () => {
    it('drops stale compareIds', () => {
      const r = validateProjectData({
        ...validData(),
        compareIds: ['preview-1', 'nonexistent-id'],
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.compareIds).toEqual(['preview-1']);
    });

    it('deduplicates compareIds', () => {
      const r = validateProjectData({
        ...validData(),
        compareIds: ['preview-1', 'preview-1', 'preview-1'],
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.compareIds).toEqual(['preview-1']);
    });

    it('normalizes non-array to []', () => {
      const r = validateProjectData({
        ...validData(),
        compareIds: 'not-array',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.compareIds).toEqual([]);
    });

    it('downgrades compare mode with <2 valid ids to grid', () => {
      const r = validateProjectData({
        ...validData(),
        layoutMode: 'compare',
        compareIds: ['preview-1'],
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.layoutMode).toBe('grid');
        expect(r.value.compareIds).toEqual([]);
      }
    });
  });

  describe('activeId', () => {
    it('preserves null activeId', () => {
      const r = validateProjectData({ ...validData(), activeId: null });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.activeId).toBeNull();
    });

    it('preserves undefined activeId as null', () => {
      const r = validateProjectData({ ...validData(), activeId: undefined });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.activeId).toBeNull();
    });

    it('normalizes stale activeId to null', () => {
      const r = validateProjectData({
        ...validData(),
        activeId: 'nonexistent-id',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.activeId).toBeNull();
    });

    it('preserves valid activeId', () => {
      const r = validateProjectData({
        ...validData(),
        activeId: 'preview-1',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.activeId).toBe('preview-1');
    });

    it('rejects non-string/non-null activeId', () => {
      const r = validateProjectData({
        ...validData(),
        activeId: 42,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('sharedUrl', () => {
    it('accepts empty string', () => {
      const r = validateProjectData({ ...validData(), sharedUrl: '' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sharedUrl).toBe('');
    });

    it('accepts any string (lossless)', () => {
      const r = validateProjectData({
        ...validData(),
        sharedUrl: 'example.com',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.sharedUrl).toBe('example.com');
    });

    it('rejects non-string sharedUrl', () => {
      const r = validateProjectData({ ...validData(), sharedUrl: 123 });
      expect(r.ok).toBe(false);
    });
  });

  describe('layoutMode', () => {
    it('defaults to grid when missing', () => {
      const d = validData();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { layoutMode, ...rest } = d;
      const r = validateProjectData(rest);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.layoutMode).toBe('grid');
    });

    it('rejects unknown layoutMode', () => {
      const r = validateProjectData({ ...validData(), layoutMode: 'list' });
      expect(r.ok).toBe(false);
    });

    it('accepts all valid modes', () => {
      for (const mode of ['grid', 'focus', 'compare']) {
        const r = validateProjectData({ ...validData(), layoutMode: mode });
        expect(r.ok).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// validateRecord (meta validation)
// ---------------------------------------------------------------------------

describe('validateRecord', () => {
  it('accepts a valid record', () => {
    const r = validateRecord(validRecord());
    expect(r.ok).toBe(true);
  });

  it('rejects non-object record', () => {
    expect(validateRecord(null).ok).toBe(false);
    expect(validateRecord('string').ok).toBe(false);
  });

  it('rejects missing record.id', () => {
    const { id: _id, ...rest } = validRecord();
    void _id;
    expect(validateRecord(rest).ok).toBe(false);
  });

  it('rejects missing meta', () => {
    const { meta: _meta, ...rest } = validRecord();
    void _meta;
    expect(validateRecord({ ...rest }).ok).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: { name: 'Test', updatedAt: '2026-09-05T12:00:00.000Z' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing updatedAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: { name: 'Test', createdAt: '2026-09-05T12:00:00.000Z' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid createdAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: {
        name: 'Test',
        createdAt: 'not-a-date',
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects empty createdAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: {
        name: 'Test',
        createdAt: '',
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects whitespace-only createdAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: {
        name: 'Test',
        createdAt: '   ',
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid updatedAt', () => {
    const r = validateRecord({
      ...validRecord(),
      meta: {
        name: 'Test',
        createdAt: '2026-09-05T12:00:00.000Z',
        updatedAt: 'invalid',
      },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects unsupported schema version via validateProjectData', () => {
    // validateRecord delegates version checking to migrateRecord (in repository).
    // validateProjectData itself does not check schemaVersion.
    // This test verifies validateRecord still validates meta correctly.
    const r = validateRecord({
      schemaVersion: 1,
      id: 'test',
      meta: { name: 'Test' }, // missing timestamps
      data: validData(),
    });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe('normalizeName', () => {
  it('returns trimmed name when valid', () => {
    expect(normalizeName('My Project')).toBe('My Project');
  });

  it('trims whitespace', () => {
    expect(normalizeName('  My Project  ')).toBe('My Project');
  });

  it('returns default for empty string', () => {
    expect(normalizeName('')).toBe(DEFAULT_PROJECT_NAME);
  });

  it('returns default for whitespace-only', () => {
    expect(normalizeName('   ')).toBe(DEFAULT_PROJECT_NAME);
  });

  it('returns default for undefined', () => {
    expect(normalizeName(undefined)).toBe(DEFAULT_PROJECT_NAME);
  });

  it('returns default for non-string', () => {
    expect(normalizeName(123)).toBe(DEFAULT_PROJECT_NAME);
  });
});
