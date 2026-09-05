import { beforeEach, describe, expect, it } from 'vitest';

import { usePreviewStore } from '../store/usePreviewStore';

describe('usePreviewStore', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  describe('addEntry', () => {
    it('creates an entry with unique ID', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('iphone-15');
      expect(id1).not.toBe(id2);
    });

    it('defaults to portrait orientation', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      const entry = usePreviewStore.getState().entries.find((e) => e.id === id);
      expect(entry?.orientation).toBe('portrait');
    });

    it('accepts explicit orientation', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15', 'landscape');
      const entry = usePreviewStore.getState().entries.find((e) => e.id === id);
      expect(entry?.orientation).toBe('landscape');
    });

    it('increments entries count', () => {
      usePreviewStore.getState().addEntry('iphone-15');
      expect(usePreviewStore.getState().entries).toHaveLength(1);
      usePreviewStore.getState().addEntry('ipad');
      expect(usePreviewStore.getState().entries).toHaveLength(2);
    });

    it('auto-selects first entry as active', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      expect(usePreviewStore.getState().activeId).toBe(id);
    });

    it('preserves existing activeId when adding', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().addEntry('ipad');
      expect(usePreviewStore.getState().activeId).toBe(id1);
    });
  });

  describe('removeEntry', () => {
    it('removes the entry', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().removeEntry(id);
      expect(usePreviewStore.getState().entries).toHaveLength(0);
    });

    it('clears activeId if removed entry was active', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().removeEntry(id);
      expect(usePreviewStore.getState().activeId).toBeNull();
    });

    it('selects next entry when active is removed', () => {
      usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore
        .getState()
        .setActiveId(usePreviewStore.getState().entries[0]!.id);
      usePreviewStore
        .getState()
        .removeEntry(usePreviewStore.getState().entries[0]!.id);
      expect(usePreviewStore.getState().activeId).toBe(id2);
    });

    it('removes lifecycleStatus entry', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().updateLifecycleStatus(id, 'loading');
      usePreviewStore.getState().removeEntry(id);
      expect(usePreviewStore.getState().lifecycleStatus[id]).toBeUndefined();
    });
  });

  describe('updateEntry', () => {
    it('updates deviceId', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().updateEntry(id, { deviceId: 'ipad' });
      const entry = usePreviewStore.getState().entries.find((e) => e.id === id);
      expect(entry?.deviceId).toBe('ipad');
    });

    it('updates orientation', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().updateEntry(id, { orientation: 'landscape' });
      const entry = usePreviewStore.getState().entries.find((e) => e.id === id);
      expect(entry?.orientation).toBe('landscape');
    });

    it('updates customUrl', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore
        .getState()
        .updateEntry(id, { customUrl: 'https://custom.example' });
      const entry = usePreviewStore.getState().entries.find((e) => e.id === id);
      expect(entry?.customUrl).toBe('https://custom.example');
    });

    it('does not affect other entries', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore
        .getState()
        .updateEntry(id1, { deviceId: 'iphone-15-pro' });
      const entry2 = usePreviewStore
        .getState()
        .entries.find((e) => e.id === id2);
      expect(entry2?.deviceId).toBe('ipad');
    });
  });

  describe('setSharedUrl', () => {
    it('updates shared URL', () => {
      usePreviewStore.getState().setSharedUrl('https://example.com');
      expect(usePreviewStore.getState().sharedUrl).toBe('https://example.com');
    });
  });

  describe('setActiveId', () => {
    it('updates active ID', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setActiveId(null);
      expect(usePreviewStore.getState().activeId).toBeNull();
      usePreviewStore.getState().setActiveId(id);
      expect(usePreviewStore.getState().activeId).toBe(id);
    });
  });

  describe('setLayoutMode', () => {
    it('defaults to grid', () => {
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
    });

    it('updates layout mode', () => {
      usePreviewStore.getState().setLayoutMode('focus');
      expect(usePreviewStore.getState().layoutMode).toBe('focus');
    });
  });

  describe('updateLifecycleStatus', () => {
    it('sets lifecycle status', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().updateLifecycleStatus(id, 'loading');
      expect(usePreviewStore.getState().lifecycleStatus[id]).toBe('loading');
    });

    it('does not update if status unchanged', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().updateLifecycleStatus(id, 'loading');
      const stateBefore = usePreviewStore.getState();
      usePreviewStore.getState().updateLifecycleStatus(id, 'loading');
      // Should return same state reference (no unnecessary update)
      expect(usePreviewStore.getState()).toBe(stateBefore);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setSharedUrl('https://example.com');
      usePreviewStore.getState().setLayoutMode('focus');

      usePreviewStore.getState().reset();

      expect(usePreviewStore.getState().entries).toHaveLength(0);
      expect(usePreviewStore.getState().sharedUrl).toBe('');
      expect(usePreviewStore.getState().activeId).toBeNull();
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
      expect(usePreviewStore.getState().lifecycleStatus).toEqual({});
    });

    it('clears compareIds', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      usePreviewStore.getState().reset();
      expect(usePreviewStore.getState().compareIds).toEqual([]);
    });
  });

  // --- Comparison tests ---

  describe('setCompareIds', () => {
    it('sets compare IDs', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id2]);
    });

    it('filters stale IDs that no longer exist', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, 'stale-id']);
      expect(usePreviewStore.getState().compareIds).toEqual([id1]);
    });

    it('removes duplicate IDs', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id1, id1]);
      expect(usePreviewStore.getState().compareIds).toEqual([id1]);
    });

    it('preserves stable ordering', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().setCompareIds([id3, id1, id2]);
      expect(usePreviewStore.getState().compareIds).toEqual([id3, id1, id2]);
    });
  });

  describe('enterCompareMode', () => {
    it('does nothing when fewer than 2 entries exist', () => {
      usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().enterCompareMode();
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
      expect(usePreviewStore.getState().compareIds).toEqual([]);
    });

    it('enters compare mode with first 2 entries when no initialIds', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().enterCompareMode();
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id2]);
    });

    it('enters compare mode from Focus using activeId + next entry', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().setLayoutMode('focus');
      usePreviewStore.getState().setActiveId(id1);
      usePreviewStore.getState().enterCompareMode();
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
      expect(usePreviewStore.getState().compareIds).toContain(id1);
      expect(usePreviewStore.getState().compareIds).toContain(id2);
    });

    it('enters compare mode with explicit valid IDs', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().enterCompareMode([id1, id2]);
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id2]);
    });

    it('does not enter compare mode with fewer than 2 valid explicit IDs', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().enterCompareMode([id1, 'stale-id']);
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
    });
  });

  describe('toggleCompareEntry', () => {
    it('adds entry to compare selection when already in compare mode', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
      // Start in compare mode with id1 and id2
      usePreviewStore.getState().enterCompareMode([id1, id2]);
      // Toggle third entry in
      usePreviewStore.getState().toggleCompareEntry(id3);
      expect(usePreviewStore.getState().compareIds).toContain(id1);
      expect(usePreviewStore.getState().compareIds).toContain(id2);
      expect(usePreviewStore.getState().compareIds).toContain(id3);
    });

    it('removes entry from compare selection', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().setCompareIds([id1, id2, id3]);
      usePreviewStore.getState().toggleCompareEntry(id2);
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id3]);
    });

    it('exits compare mode when fewer than 2 remain', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      usePreviewStore.getState().setLayoutMode('compare');
      usePreviewStore.getState().toggleCompareEntry(id1);
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
      expect(usePreviewStore.getState().compareIds).toEqual([]);
    });
  });

  describe('removeEntry with compareIds', () => {
    it('removes entry from compareIds', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      usePreviewStore.getState().removeEntry(id1);
      expect(usePreviewStore.getState().compareIds).toEqual([id2]);
    });

    it('exits compare mode when fewer than 2 entries remain', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      usePreviewStore.getState().setLayoutMode('compare');
      usePreviewStore.getState().removeEntry(id1);
      // Exits compare mode (layout changes to grid)
      expect(usePreviewStore.getState().layoutMode).toBe('grid');
      // Remaining entry stays in compareIds (preserved for potential re-entry)
      expect(usePreviewStore.getState().compareIds).toEqual([id2]);
    });

    it('preserves compareIds when sufficient entries remain', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().setCompareIds([id1, id2, id3]);
      usePreviewStore.getState().setLayoutMode('compare');
      usePreviewStore.getState().removeEntry(id1);
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
      expect(usePreviewStore.getState().compareIds).toEqual([id2, id3]);
    });
  });

  describe('activeId independence', () => {
    it('activeId remains independent from compareIds', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
      usePreviewStore.getState().setActiveId(id3);
      usePreviewStore.getState().setCompareIds([id1, id2]);
      expect(usePreviewStore.getState().activeId).toBe(id3);
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id2]);
    });

    it('changing activeId does not affect compareIds', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setCompareIds([id1, id2]);
      usePreviewStore.getState().setActiveId(id1);
      usePreviewStore.getState().setActiveId(id2);
      expect(usePreviewStore.getState().compareIds).toEqual([id1, id2]);
    });

    it('toggling compare does not affect activeId', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setActiveId(id1);
      usePreviewStore.getState().toggleCompareEntry(id1);
      usePreviewStore.getState().toggleCompareEntry(id2);
      expect(usePreviewStore.getState().activeId).toBe(id1);
    });
  });

  // --- Inspection tests ---

  describe('setInspectionResult', () => {
    it('stores a snapshot for a preview entry', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 42,
      });
      const snap = usePreviewStore.getState().inspectionResults[id];
      expect(snap?.phase).toBe('ready');
      expect(snap?.elementsScanned).toBe(42);
    });

    it('overwrites a previous snapshot', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'running',
      });
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 2000,
        diagnostics: [],
        elementsScanned: 10,
      });
      expect(usePreviewStore.getState().inspectionResults[id]!.phase).toBe(
        'ready'
      );
    });

    it('isolates results between entries', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setInspectionResult(id1, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 5,
      });
      usePreviewStore.getState().setInspectionResult(id2, {
        phase: 'inaccessible',
        inaccessibleReason: 'cross-origin',
      });
      expect(usePreviewStore.getState().inspectionResults[id1]!.phase).toBe(
        'ready'
      );
      expect(usePreviewStore.getState().inspectionResults[id2]!.phase).toBe(
        'inaccessible'
      );
    });
  });

  describe('removeEntry clears inspection results', () => {
    it('removes inspection result for the deleted entry', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 10,
      });
      usePreviewStore.getState().removeEntry(id);
      expect(usePreviewStore.getState().inspectionResults[id]).toBeUndefined();
    });

    it('does not remove inspection results for other entries', () => {
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().setInspectionResult(id1, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 10,
      });
      usePreviewStore.getState().setInspectionResult(id2, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 20,
      });
      usePreviewStore.getState().removeEntry(id1);
      expect(usePreviewStore.getState().inspectionResults[id2]).toBeDefined();
    });
  });

  describe('reset clears inspection results', () => {
    it('clears inspectionResults', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 5,
      });
      usePreviewStore.getState().reset();
      expect(usePreviewStore.getState().inspectionResults).toEqual({});
    });
  });

  describe('inspectionActive and requestInspection', () => {
    it('starts inactive', () => {
      expect(usePreviewStore.getState().inspectionActive).toBe(false);
    });

    it('setInspectionActive(true) activates', () => {
      usePreviewStore.getState().setInspectionActive(true);
      expect(usePreviewStore.getState().inspectionActive).toBe(true);
    });

    it('setInspectionActive(false) deactivates and clears results', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionActive(true);
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 1000,
        diagnostics: [],
        elementsScanned: 5,
      });
      usePreviewStore.getState().setInspectionActive(false);
      expect(usePreviewStore.getState().inspectionActive).toBe(false);
      expect(usePreviewStore.getState().inspectionResults).toEqual({});
    });

    it('setInspectionActive is idempotent', () => {
      usePreviewStore.getState().setInspectionActive(true);
      const stateBefore = usePreviewStore.getState();
      usePreviewStore.getState().setInspectionActive(true);
      expect(usePreviewStore.getState()).toBe(stateBefore);
    });

    it('requestInspection activates and bumps the token', () => {
      expect(usePreviewStore.getState().inspectionRequest).toBe(0);
      usePreviewStore.getState().requestInspection();
      expect(usePreviewStore.getState().inspectionActive).toBe(true);
      expect(usePreviewStore.getState().inspectionRequest).toBe(1);
    });

    it('requestInspection bumps token when already active', () => {
      usePreviewStore.getState().setInspectionActive(true);
      usePreviewStore.getState().requestInspection();
      expect(usePreviewStore.getState().inspectionActive).toBe(true);
      expect(usePreviewStore.getState().inspectionRequest).toBe(1);
    });
  });

  // --- Hydration tests ---

  describe('hydrate', () => {
    it('sets entries from payload', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: 'https://example.com',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().entries).toHaveLength(1);
      expect(usePreviewStore.getState().entries[0]!.deviceId).toBe('iphone-15');
    });

    it('sets sharedUrl', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: 'https://test.com',
        entries: [],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().sharedUrl).toBe('https://test.com');
    });

    it('sets layoutMode', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
          { id: 'preview-2', deviceId: 'ipad', orientation: 'portrait' },
        ],
        layoutMode: 'compare',
        compareIds: ['preview-1', 'preview-2'],
        activeId: null,
      });
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
    });

    it('preserves activeId null', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().activeId).toBeNull();
    });

    it('preserves valid activeId', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: 'preview-1',
      });
      expect(usePreviewStore.getState().activeId).toBe('preview-1');
    });

    it('clears lifecycleStatus', () => {
      usePreviewStore.getState().addEntry('iphone-15');
      const id = usePreviewStore.getState().entries[0]!.id;
      usePreviewStore.getState().updateLifecycleStatus(id, 'ready');
      expect(usePreviewStore.getState().lifecycleStatus[id]).toBe('ready');

      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-99', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().lifecycleStatus).toEqual({});
    });

    it('clears inspectionResults', () => {
      const id = usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().setInspectionResult(id, {
        phase: 'ready',
        inspectedAt: 1000,
      });
      expect(usePreviewStore.getState().inspectionResults[id]).toBeDefined();

      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().inspectionResults).toEqual({});
    });

    it('clears inspectionActive and inspectionRequest', () => {
      usePreviewStore.getState().requestInspection();
      expect(usePreviewStore.getState().inspectionActive).toBe(true);
      expect(usePreviewStore.getState().inspectionRequest).toBe(1);

      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().inspectionActive).toBe(false);
      expect(usePreviewStore.getState().inspectionRequest).toBe(0);
    });

    it('replaces compareIds', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
          { id: 'preview-2', deviceId: 'ipad', orientation: 'portrait' },
        ],
        layoutMode: 'compare',
        compareIds: ['preview-1', 'preview-2'],
        activeId: null,
      });
      expect(usePreviewStore.getState().compareIds).toEqual([
        'preview-1',
        'preview-2',
      ]);
    });

    it('new addEntry after hydrate never collides with hydrated ids', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
          { id: 'preview-5', deviceId: 'ipad', orientation: 'portrait' },
          {
            id: 'preview-3',
            deviceId: 'iphone-15-pro',
            orientation: 'portrait',
          },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });

      const newId = usePreviewStore.getState().addEntry('iphone-15');
      expect(newId).not.toBe('preview-1');
      expect(newId).not.toBe('preview-3');
      expect(newId).not.toBe('preview-5');
      expect(newId).toMatch(/^preview-\d+$/);
    });

    it('hydrated payload entries are mapped to full PreviewEntry shape', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
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
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });

      const entry = usePreviewStore.getState().entries[0]!;
      expect(entry.id).toBe('preview-1');
      expect(entry.deviceId).toBe('__custom__');
      expect(entry.orientation).toBe('landscape');
      expect(entry.viewportMode).toBe('custom');
      expect(entry.customViewportWidth).toBe(1024);
      expect(entry.customViewportHeight).toBe(768);
    });

    it('hydrated entries with customUrl preserve it', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: '',
        entries: [
          {
            id: 'preview-1',
            deviceId: 'iphone-15',
            orientation: 'portrait',
            customUrl: 'https://custom.example',
          },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().entries[0]!.customUrl).toBe(
        'https://custom.example'
      );
    });

    it('repeated hydrate replaces previous state', () => {
      usePreviewStore.getState().hydrate({
        sharedUrl: 'https://first.com',
        entries: [
          { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
        ],
        layoutMode: 'grid',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().entries).toHaveLength(1);

      usePreviewStore.getState().hydrate({
        sharedUrl: 'https://second.com',
        entries: [],
        layoutMode: 'focus',
        compareIds: [],
        activeId: null,
      });
      expect(usePreviewStore.getState().entries).toHaveLength(0);
      expect(usePreviewStore.getState().sharedUrl).toBe('https://second.com');
      expect(usePreviewStore.getState().layoutMode).toBe('focus');
    });
  });
});
