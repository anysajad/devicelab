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
});
