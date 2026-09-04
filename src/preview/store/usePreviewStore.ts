import { create } from 'zustand';

import type {
  DeviceOrientation,
  LayoutMode,
  PreviewEntry,
  PreviewInstanceId,
  PreviewLifecycle,
} from '../types';

/** Stable session-local ID generator. */
let nextId = 1;
function generateId(): PreviewInstanceId {
  return `preview-${nextId++}`;
}

/**
 * Sanitize an array of preview IDs:
 * - Remove IDs that no longer exist in entries
 * - Remove duplicates
 * - Preserve stable ordering (maintain order from entries)
 */
function sanitizeCompareIds(
  ids: PreviewInstanceId[],
  entries: PreviewEntry[]
): PreviewInstanceId[] {
  const entryIds = new Set(entries.map((e) => e.id));
  const seen = new Set<PreviewInstanceId>();
  const result: PreviewInstanceId[] = [];
  for (const id of ids) {
    if (entryIds.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  return result;
}

export interface PreviewCollectionState {
  /** Ordered list of preview entries. */
  entries: PreviewEntry[];
  /** Shared URL applied to all previews (unless overridden by customUrl). */
  sharedUrl: string;
  /** ID of the currently active/selected preview (for focus mode). */
  activeId: PreviewInstanceId | null;
  /** Current layout mode. */
  layoutMode: LayoutMode;
  /** Entry IDs selected for comparison. Only meaningful in compare mode. */
  compareIds: PreviewInstanceId[];
  /** Lightweight lifecycle status per entry, updated by PreviewInstance. */
  lifecycleStatus: Record<PreviewInstanceId, PreviewLifecycle>;
}

export interface PreviewCollectionActions {
  /** Add a new preview entry. Returns the new entry's ID. */
  addEntry: (
    deviceId: string,
    orientation?: DeviceOrientation
  ) => PreviewInstanceId;
  /** Remove a preview entry and clean up related state. */
  removeEntry: (id: PreviewInstanceId) => void;
  /** Update fields on an existing preview entry. */
  updateEntry: (
    id: PreviewInstanceId,
    updates: Partial<
      Pick<
        PreviewEntry,
        | 'deviceId'
        | 'orientation'
        | 'customUrl'
        | 'viewportMode'
        | 'customViewportWidth'
        | 'customViewportHeight'
      >
    >
  ) => void;
  /** Set the active preview for focus mode. */
  setActiveId: (id: PreviewInstanceId | null) => void;
  /** Set the layout mode. */
  setLayoutMode: (mode: LayoutMode) => void;
  /** Set the shared URL. */
  setSharedUrl: (url: string) => void;
  /** Update the lifecycle status for a preview entry. */
  updateLifecycleStatus: (
    id: PreviewInstanceId,
    lifecycle: PreviewLifecycle
  ) => void;
  /** Reset to clean initial state. */
  reset: () => void;

  // --- Comparison actions ---

  /** Set compare IDs directly. Stale/duplicate IDs are sanitized. */
  setCompareIds: (ids: PreviewInstanceId[]) => void;
  /** Toggle an entry in/out of the comparison set. */
  toggleCompareEntry: (id: PreviewInstanceId) => void;
  /** Enter compare mode with an optional initial selection. */
  enterCompareMode: (initialIds?: PreviewInstanceId[]) => void;
  /** Exit compare mode and clear selection. */
  exitCompareMode: () => void;
}

const INITIAL_STATE: PreviewCollectionState = {
  entries: [],
  sharedUrl: '',
  activeId: null,
  layoutMode: 'grid',
  compareIds: [],
  lifecycleStatus: {},
};

export const usePreviewStore = create<
  PreviewCollectionState & PreviewCollectionActions
>()((set) => ({
  ...INITIAL_STATE,

  addEntry: (deviceId, orientation = 'portrait') => {
    const id = generateId();
    const entry: PreviewEntry = {
      id,
      deviceId,
      orientation,
    };
    set((state) => ({
      entries: [...state.entries, entry],
      // Auto-select the new entry if nothing is active
      activeId: state.activeId ?? id,
    }));
    return id;
  },

  removeEntry: (id) => {
    set((state) => {
      const newEntries = state.entries.filter((e) => e.id !== id);
      const newLifecycleStatus = Object.fromEntries(
        Object.entries(state.lifecycleStatus).filter(([key]) => key !== id)
      );

      // Clean up activeId if the removed entry was active
      let newActiveId = state.activeId;
      if (newActiveId === id) {
        newActiveId = newEntries.length > 0 ? newEntries[0]!.id : null;
      }

      // Clean up compareIds — remove the deleted entry
      const newCompareIds = state.compareIds.filter((cid) => cid !== id);

      // If compare mode now has fewer than 2 selected entries, exit compare mode
      let newLayoutMode = state.layoutMode;
      if (newLayoutMode === 'compare' && newCompareIds.length < 2) {
        newLayoutMode = 'grid';
      }

      return {
        entries: newEntries,
        activeId: newActiveId,
        lifecycleStatus: newLifecycleStatus,
        compareIds: newCompareIds,
        layoutMode: newLayoutMode,
      };
    });
  },

  updateEntry: (id, updates) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }));
  },

  setActiveId: (id) => {
    set({ activeId: id });
  },

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
  },

  setSharedUrl: (url) => {
    set({ sharedUrl: url });
  },

  updateLifecycleStatus: (id, lifecycle) => {
    set((state) => {
      // Avoid unnecessary updates if status hasn't changed
      if (state.lifecycleStatus[id] === lifecycle) return state;
      return {
        lifecycleStatus: { ...state.lifecycleStatus, [id]: lifecycle },
      };
    });
  },

  reset: () => {
    set(INITIAL_STATE);
  },

  // --- Comparison actions ---

  setCompareIds: (ids) => {
    set((state) => ({
      compareIds: sanitizeCompareIds(ids, state.entries),
    }));
  },

  toggleCompareEntry: (id) => {
    set((state) => {
      const isCurrentlySelected = state.compareIds.includes(id);
      let newCompareIds: PreviewInstanceId[];

      if (isCurrentlySelected) {
        newCompareIds = state.compareIds.filter((cid) => cid !== id);
      } else {
        newCompareIds = [...state.compareIds, id];
      }

      newCompareIds = sanitizeCompareIds(newCompareIds, state.entries);

      // If fewer than 2 entries remain selected, exit compare mode
      if (newCompareIds.length < 2) {
        return {
          compareIds: [],
          layoutMode: 'grid',
        };
      }

      return { compareIds: newCompareIds };
    });
  },

  enterCompareMode: (initialIds) => {
    set((state) => {
      // Need at least 2 entries to compare
      if (state.entries.length < 2) return state;

      let selectedIds: PreviewInstanceId[];

      if (initialIds && initialIds.length > 0) {
        selectedIds = sanitizeCompareIds(initialIds, state.entries);
      } else if (state.layoutMode === 'focus' && state.activeId) {
        // From Focus: use activeId plus the next available entry
        const nextEntry = state.entries.find((e) => e.id !== state.activeId);
        selectedIds = nextEntry
          ? [state.activeId, nextEntry.id]
          : [state.activeId];
        selectedIds = sanitizeCompareIds(selectedIds, state.entries);
      } else {
        // From Grid or other: use the first two entries
        selectedIds = state.entries.slice(0, 2).map((e) => e.id);
      }

      // Need at least 2 valid entries to enter compare mode
      if (selectedIds.length < 2) return state;

      return {
        layoutMode: 'compare' as const,
        compareIds: selectedIds,
      };
    });
  },

  exitCompareMode: () => {
    set({
      layoutMode: 'grid',
      compareIds: [],
    });
  },
}));
