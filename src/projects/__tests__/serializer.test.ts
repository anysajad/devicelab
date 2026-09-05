import { describe, expect, it } from 'vitest';

import {
  toProjectData,
  toHydratePayload,
  buildProjectRecord,
} from '../serializer';
import type { PreviewCollectionState } from '../../preview/store/usePreviewStore';

function makeState(
  overrides?: Partial<PreviewCollectionState>
): PreviewCollectionState {
  return {
    entries: [],
    sharedUrl: '',
    activeId: null,
    layoutMode: 'grid',
    compareIds: [],
    lifecycleStatus: {},
    inspectionResults: {},
    inspectionActive: false,
    inspectionRequest: 0,
    ...overrides,
  };
}

describe('toProjectData', () => {
  it('serializes entries', () => {
    const state = makeState({
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
    });
    const data = toProjectData(state);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toEqual({
      id: 'preview-1',
      deviceId: 'iphone-15',
      orientation: 'portrait',
    });
  });

  it('serializes custom viewport entry', () => {
    const state = makeState({
      entries: [
        {
          id: 'preview-1',
          deviceId: '__custom__',
          orientation: 'landscape',
          viewportMode: 'custom',
          customViewportWidth: 1024,
          customViewportHeight: 768,
        },
      ],
    });
    const data = toProjectData(state);
    expect(data.entries[0]).toEqual({
      id: 'preview-1',
      deviceId: '__custom__',
      orientation: 'landscape',
      viewportMode: 'custom',
      customViewportWidth: 1024,
      customViewportHeight: 768,
    });
  });

  it('serializes customUrl when present', () => {
    const state = makeState({
      entries: [
        {
          id: 'preview-1',
          deviceId: 'iphone-15',
          orientation: 'portrait',
          customUrl: 'https://custom.example',
        },
      ],
    });
    const data = toProjectData(state);
    expect(data.entries[0]!.customUrl).toBe('https://custom.example');
  });

  it('omits customUrl when absent', () => {
    const state = makeState({
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
    });
    const data = toProjectData(state);
    expect(data.entries[0]!.customUrl).toBeUndefined();
  });

  it('serializes sharedUrl', () => {
    const state = makeState({ sharedUrl: 'https://example.com' });
    expect(toProjectData(state).sharedUrl).toBe('https://example.com');
  });

  it('serializes layoutMode', () => {
    const state = makeState({ layoutMode: 'focus' });
    expect(toProjectData(state).layoutMode).toBe('focus');
  });

  it('serializes compareIds', () => {
    const state = makeState({ compareIds: ['preview-1', 'preview-2'] });
    expect(toProjectData(state).compareIds).toEqual(['preview-1', 'preview-2']);
  });

  it('serializes activeId', () => {
    const state = makeState({ activeId: 'preview-1' });
    expect(toProjectData(state).activeId).toBe('preview-1');
  });

  it('serializes activeId null', () => {
    const state = makeState({ activeId: null });
    expect(toProjectData(state).activeId).toBeNull();
  });

  it('omits lifecycleStatus (runtime-only)', () => {
    const state = makeState({
      lifecycleStatus: { 'preview-1': 'ready' },
    });
    const data = toProjectData(state);
    expect(data).not.toHaveProperty('lifecycleStatus');
  });

  it('omits inspectionResults (runtime-only)', () => {
    const state = makeState({
      inspectionResults: { 'preview-1': { phase: 'ready' } },
    });
    const data = toProjectData(state);
    expect(data).not.toHaveProperty('inspectionResults');
  });

  it('omits inspectionActive (runtime-only)', () => {
    const state = makeState({ inspectionActive: true });
    const data = toProjectData(state);
    expect(data).not.toHaveProperty('inspectionActive');
  });

  it('omits inspectionRequest (runtime-only)', () => {
    const state = makeState({ inspectionRequest: 5 });
    const data = toProjectData(state);
    expect(data).not.toHaveProperty('inspectionRequest');
  });

  it('serializes empty state', () => {
    const data = toProjectData(makeState());
    expect(data).toEqual({
      sharedUrl: '',
      entries: [],
      layoutMode: 'grid',
      compareIds: [],
      activeId: null,
    });
  });

  it('produces a new array for compareIds (not reference)', () => {
    const compareIds = ['preview-1'];
    const state = makeState({ compareIds });
    const data = toProjectData(state);
    expect(data.compareIds).toEqual(compareIds);
    expect(data.compareIds).not.toBe(compareIds);
  });
});

describe('toHydratePayload', () => {
  it('converts ProjectData to HydratePayload', () => {
    const data = {
      sharedUrl: 'https://example.com',
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
      layoutMode: 'grid',
      compareIds: [],
      activeId: null,
    };
    const payload = toHydratePayload(data);
    expect(payload).toEqual(data);
  });

  it('creates new arrays (not references)', () => {
    const data = {
      sharedUrl: '',
      entries: [
        { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
      ],
      layoutMode: 'grid',
      compareIds: ['preview-1'],
      activeId: 'preview-1',
    };
    const payload = toHydratePayload(data);
    expect(payload.entries).not.toBe(data.entries);
    expect(payload.compareIds).not.toBe(data.compareIds);
  });
});

describe('buildProjectRecord', () => {
  it('builds a complete record', () => {
    const data = {
      sharedUrl: 'https://example.com',
      entries: [],
      layoutMode: 'grid',
      compareIds: [],
      activeId: null,
    };
    const meta = {
      name: 'Test',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const record = buildProjectRecord('proj-1', data, meta);
    expect(record).toEqual({
      schemaVersion: 1,
      id: 'proj-1',
      meta,
      data,
    });
  });

  it('creates new arrays (not references)', () => {
    const entries = [
      { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
    ];
    const compareIds = ['preview-1'];
    const data = {
      sharedUrl: '',
      entries,
      layoutMode: 'grid',
      compareIds,
      activeId: 'preview-1',
    };
    const meta = {
      name: 'Test',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const record = buildProjectRecord('proj-1', data, meta);
    expect(record.data.entries).not.toBe(entries);
    expect(record.data.compareIds).not.toBe(compareIds);
  });
});
