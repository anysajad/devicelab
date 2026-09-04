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

export interface PreviewCollectionState {
  /** Ordered list of preview entries. */
  entries: PreviewEntry[];
  /** Shared URL applied to all previews (unless overridden by customUrl). */
  sharedUrl: string;
  /** ID of the currently active/selected preview (for focus mode). */
  activeId: PreviewInstanceId | null;
  /** Current layout mode. */
  layoutMode: LayoutMode;
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
}

const INITIAL_STATE: PreviewCollectionState = {
  entries: [],
  sharedUrl: '',
  activeId: null,
  layoutMode: 'grid',
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

      return {
        entries: newEntries,
        activeId: newActiveId,
        lifecycleStatus: newLifecycleStatus,
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
}));
