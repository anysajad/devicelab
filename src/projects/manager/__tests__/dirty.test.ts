import { describe, expect, it } from 'vitest';

import { projectDataEqual, computeDirty, EMPTY_PROJECT_DATA } from '../dirty';
import type { ProjectData } from '../../types';

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

// ---------------------------------------------------------------------------
// projectDataEqual
// ---------------------------------------------------------------------------

describe('projectDataEqual', () => {
  it('returns true for identical empty data', () => {
    expect(projectDataEqual(EMPTY_PROJECT_DATA, EMPTY_PROJECT_DATA)).toBe(true);
  });

  it('returns false when sharedUrl differs', () => {
    const a = makeData();
    const b = makeData({ sharedUrl: 'https://other.com' });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when entries differ', () => {
    const a = makeData();
    const b = makeData({
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        { id: 'preview-2', deviceId: 'ipad', orientation: 'landscape' },
      ],
    });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when layoutMode differs', () => {
    const a = makeData();
    const b = makeData({ layoutMode: 'focus' });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when compareIds differ', () => {
    const a = makeData({ compareIds: ['preview-1', 'preview-2'] });
    const b = makeData({ compareIds: ['preview-1'] });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when activeId differs', () => {
    const a = makeData({ activeId: 'preview-1' });
    const b = makeData({ activeId: null });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns true for entries with custom viewport fields', () => {
    const a = makeData({
      entries: [
        {
          id: 'c1',
          deviceId: '__custom__',
          orientation: 'portrait',
          viewportMode: 'custom',
          customViewportWidth: 1024,
          customViewportHeight: 768,
        },
      ],
    });
    const b = makeData({
      entries: [
        {
          id: 'c1',
          deviceId: '__custom__',
          orientation: 'portrait',
          viewportMode: 'custom',
          customViewportWidth: 1024,
          customViewportHeight: 768,
        },
      ],
    });
    expect(projectDataEqual(a, b)).toBe(true);
  });

  it('detects custom viewport width change', () => {
    const a = makeData({
      entries: [
        {
          id: 'c1',
          deviceId: '__custom__',
          orientation: 'portrait',
          viewportMode: 'custom',
          customViewportWidth: 1024,
          customViewportHeight: 768,
        },
      ],
    });
    const b = makeData({
      entries: [
        {
          id: 'c1',
          deviceId: '__custom__',
          orientation: 'portrait',
          viewportMode: 'custom',
          customViewportWidth: 800,
          customViewportHeight: 768,
        },
      ],
    });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when entries are in different order', () => {
    const a = makeData({
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        { id: 'preview-2', deviceId: 'ipad', orientation: 'portrait' },
      ],
    });
    const b = makeData({
      entries: [
        { id: 'preview-2', deviceId: 'ipad', orientation: 'portrait' },
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
    });
    expect(projectDataEqual(a, b)).toBe(false);
  });

  it('returns false when customUrl differs', () => {
    const a = makeData({
      entries: [
        {
          id: 'p1',
          deviceId: 'iphone-15',
          orientation: 'portrait',
          customUrl: 'https://a.com',
        },
      ],
    });
    const b = makeData({
      entries: [
        {
          id: 'p1',
          deviceId: 'iphone-15',
          orientation: 'portrait',
          customUrl: 'https://b.com',
        },
      ],
    });
    expect(projectDataEqual(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeDirty
// ---------------------------------------------------------------------------

describe('computeDirty', () => {
  it('returns false when no changes and never saved', () => {
    expect(computeDirty(EMPTY_PROJECT_DATA, null, '', null)).toBe(false);
  });

  it('returns false when data matches saved snapshot', () => {
    const data = makeData();
    expect(computeDirty(data, data, 'My Project', 'My Project')).toBe(false);
  });

  it('returns true when data differs from saved snapshot', () => {
    const saved = makeData();
    const current = makeData({ sharedUrl: 'https://changed.com' });
    expect(computeDirty(current, saved, 'My Project', 'My Project')).toBe(true);
  });

  it('returns true when name differs from saved name', () => {
    const data = makeData();
    expect(computeDirty(data, data, 'New Name', 'Old Name')).toBe(true);
  });

  it('returns true when data differs from null baseline', () => {
    expect(computeDirty(makeData(), null, 'Untitled project', null)).toBe(true);
  });

  it('returns false when both data and name match', () => {
    const data = makeData();
    expect(computeDirty(data, data, 'A', 'A')).toBe(false);
  });
});
