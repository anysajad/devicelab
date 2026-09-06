import { describe, expect, it } from 'vitest';

import type { ProjectRecord } from '../types';
import {
  exportProjectRecord,
  generateExportFilename,
  parseProjectImport,
  slugifyName,
} from '../importExport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides?: Partial<ProjectRecord>): ProjectRecord {
  return {
    schemaVersion: 1,
    id: 'test-id-123',
    meta: {
      name: 'Test Project',
      createdAt: '2025-01-15T10:30:00.000Z',
      updatedAt: '2025-01-15T11:00:00.000Z',
    },
    data: {
      sharedUrl: 'https://example.com',
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
      layoutMode: 'grid',
      compareIds: [],
      activeId: null,
    },
    ...overrides,
  };
}

function makeRecordJson(record?: Partial<ProjectRecord>): string {
  return JSON.stringify(makeRecord(record), null, 2);
}

// ---------------------------------------------------------------------------
// exportProjectRecord
// ---------------------------------------------------------------------------

describe('exportProjectRecord', () => {
  it('produces valid JSON', () => {
    const json = exportProjectRecord(makeRecord());
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('includes all persisted fields', () => {
    const record = makeRecord();
    const json = exportProjectRecord(record);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.id).toBe('test-id-123');
    expect(parsed.meta.name).toBe('Test Project');
    expect(parsed.meta.createdAt).toBe('2025-01-15T10:30:00.000Z');
    expect(parsed.meta.updatedAt).toBe('2025-01-15T11:00:00.000Z');
    expect(parsed.data.sharedUrl).toBe('https://example.com');
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.layoutMode).toBe('grid');
    expect(parsed.data.compareIds).toEqual([]);
    expect(parsed.data.activeId).toBeNull();
  });

  it('preserves custom viewport fields in entries', () => {
    const record = makeRecord({
      data: {
        sharedUrl: '',
        entries: [
          {
            id: 'custom-1',
            deviceId: '__custom__',
            orientation: 'portrait',
            viewportMode: 'custom',
            customViewportWidth: 375,
            customViewportHeight: 812,
            customUrl: 'https://test.com',
          },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      },
    });
    const json = exportProjectRecord(record);
    const parsed = JSON.parse(json);
    const entry = parsed.data.entries[0];

    expect(entry.id).toBe('custom-1');
    expect(entry.deviceId).toBe('__custom__');
    expect(entry.viewportMode).toBe('custom');
    expect(entry.customViewportWidth).toBe(375);
    expect(entry.customViewportHeight).toBe(812);
    expect(entry.customUrl).toBe('https://test.com');
  });

  it('does not include runtime-only state', () => {
    const json = exportProjectRecord(makeRecord());
    const parsed = JSON.parse(json);

    // No lifecycle, inspection, zoom, tools
    expect(parsed.lifecycleStatus).toBeUndefined();
    expect(parsed.inspectionResults).toBeUndefined();
    expect(parsed.inspectionActive).toBeUndefined();
    expect(parsed.inspectionRequest).toBeUndefined();
  });

  it('stabilizes compareIds order', () => {
    const record = makeRecord({
      data: {
        sharedUrl: '',
        entries: [
          { id: 'a', deviceId: 'iphone-15', orientation: 'portrait' },
          { id: 'b', deviceId: 'ipad', orientation: 'landscape' },
        ],
        layoutMode: 'compare',
        compareIds: ['b', 'a'],
        activeId: 'a',
      },
    });
    const json = exportProjectRecord(record);
    const parsed = JSON.parse(json);
    expect(parsed.data.compareIds).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------
// slugifyName / generateExportFilename
// ---------------------------------------------------------------------------

describe('slugifyName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyName('My Project')).toBe('my-project');
  });

  it('strips diacritics', () => {
    expect(slugifyName('Über Cãmél')).toBe('uber-camel');
  });

  it('removes non-alphanumeric chars', () => {
    expect(slugifyName('Project #1 (2025)')).toBe('project-1-2025');
  });

  it('truncates to 80 chars', () => {
    const long = 'a'.repeat(100);
    expect(slugifyName(long)).toHaveLength(80);
  });

  it('falls back to "project" for empty input', () => {
    expect(slugifyName('')).toBe('project');
    expect(slugifyName('---')).toBe('project');
  });
});

describe('generateExportFilename', () => {
  it('produces .devicelab.json extension', () => {
    expect(generateExportFilename('Test')).toMatch(/\.devicelab\.json$/);
  });

  it('uses slugified name', () => {
    expect(generateExportFilename('My Project')).toBe(
      'my-project.devicelab.json'
    );
  });

  it('falls back for empty name', () => {
    expect(generateExportFilename('')).toBe('project.devicelab.json');
  });
});

// ---------------------------------------------------------------------------
// parseProjectImport
// ---------------------------------------------------------------------------

describe('parseProjectImport', () => {
  describe('valid imports', () => {
    it('parses a valid record', () => {
      const result = parseProjectImport(makeRecordJson());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.schemaVersion).toBe(1);
        expect(result.value.meta.name).toBe('Test Project');
        expect(result.value.data.sharedUrl).toBe('https://example.com');
        expect(result.value.data.entries).toHaveLength(1);
      }
    });

    it('normalizes missing name', () => {
      const record = makeRecord({
        meta: {
          name: '',
          createdAt: '2025-01-15T10:30:00.000Z',
          updatedAt: '2025-01-15T11:00:00.000Z',
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.meta.name).toBe('Untitled project');
      }
    });

    it('strips BOM', () => {
      const json = '\uFEFF' + makeRecordJson();
      const result = parseProjectImport(json);
      expect(result.ok).toBe(true);
    });

    it('tolerates extra fields', () => {
      const record = makeRecord();
      const json = JSON.stringify({ ...record, extraField: 'ignored' });
      const result = parseProjectImport(json);
      expect(result.ok).toBe(true);
    });
  });

  describe('rejects malformed JSON', () => {
    it('rejects non-JSON string', () => {
      const result = parseProjectImport('not json at all');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('invalid JSON');
      }
    });

    it('rejects JSON array', () => {
      const result = parseProjectImport('[]');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('expected a JSON object');
      }
    });

    it('rejects JSON null', () => {
      const result = parseProjectImport('null');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('expected a JSON object');
      }
    });

    it('rejects JSON number', () => {
      const result = parseProjectImport('42');
      expect(result.ok).toBe(false);
    });
  });

  describe('rejects invalid schema', () => {
    it('rejects missing schemaVersion', () => {
      const record = { id: 'x', meta: {}, data: {} };
      const result = parseProjectImport(JSON.stringify(record));
      expect(result.ok).toBe(false);
    });

    it('rejects future schema version', () => {
      const record = makeRecord({ schemaVersion: 99 });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
    });

    it('rejects string schemaVersion', () => {
      const record = makeRecord({ schemaVersion: '1' as unknown as number });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
    });

    it('rejects float schemaVersion', () => {
      const record = makeRecord({ schemaVersion: 1.5 });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
    });
  });

  describe('rejects invalid timestamps', () => {
    it('rejects missing createdAt', () => {
      const record = makeRecord({
        meta: {
          name: 'Test',
          createdAt: '',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('createdAt');
      }
    });

    it('rejects invalid updatedAt', () => {
      const record = makeRecord({
        meta: {
          name: 'Test',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: 'not-a-date',
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('updatedAt');
      }
    });
  });

  describe('rejects invalid project data', () => {
    it('rejects unknown deviceId', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            {
              id: 'e1',
              deviceId: 'nonexistent-device',
              orientation: 'portrait',
            },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('unknown deviceId');
      }
    });

    it('rejects custom viewport without __custom__ deviceId', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            {
              id: 'e1',
              deviceId: 'iphone-15',
              orientation: 'portrait',
              viewportMode: 'custom',
              customViewportWidth: 375,
              customViewportHeight: 812,
            },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain(
          'viewportMode "custom" requires deviceId'
        );
      }
    });

    it('rejects custom viewport with missing width', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            {
              id: 'e1',
              deviceId: '__custom__',
              orientation: 'portrait',
              viewportMode: 'custom',
              customViewportHeight: 812,
            },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('customViewportWidth');
      }
    });

    it('rejects custom viewport with out-of-range width', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            {
              id: 'e1',
              deviceId: '__custom__',
              orientation: 'portrait',
              viewportMode: 'custom',
              customViewportWidth: 50,
              customViewportHeight: 812,
            },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('out of range');
      }
    });

    it('rejects duplicate entry ids', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            { id: 'dup', deviceId: 'iphone-15', orientation: 'portrait' },
            { id: 'dup', deviceId: 'ipad', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('duplicate id');
      }
    });

    it('rejects invalid orientation', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'diagonal' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('invalid orientation');
      }
    });

    it('rejects unknown layoutMode', () => {
      const record = makeRecord({
        data: {
          sharedUrl: '',
          entries: [],
          layoutMode: 'unknown',
          compareIds: [],
          activeId: null,
        },
      });
      const result = parseProjectImport(makeRecordJson(record));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('unknown');
      }
    });
  });

  describe('file size', () => {
    it('rejects files over 1 MB', () => {
      const huge = 'x'.repeat(1_000_001);
      const result = parseProjectImport(huge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('too large');
      }
    });
  });

  describe('security', () => {
    it('does not pollute prototype via __proto__', () => {
      const malicious = JSON.stringify({
        schemaVersion: 1,
        id: 'x',
        __proto__: { polluted: true },
        meta: {
          name: 'Test',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
        data: {
          sharedUrl: '',
          entries: [],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      parseProjectImport(malicious);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });
  });
});
