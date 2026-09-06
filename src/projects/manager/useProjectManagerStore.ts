/**
 * ProjectManagerStore — thin controller layer over the preview store.
 *
 * Handles project lifecycle (create, save, open, rename, delete),
 * dirty-state tracking, confirmation flow, and error/status surfacing.
 *
 * usePreviewStore remains the single source of workspace truth.
 * This store holds project-level metadata + dispatches serialize/hydrate.
 */

import { create } from 'zustand';

import type { ProjectData } from '../types';
import type { ProjectRepository } from '../repository';
import type { BootedProject } from '../bootstrap';
import { toProjectData, toHydratePayload } from '../serializer';
import { normalizeName } from '../validator';
import { usePreviewStore } from '../../preview/store/usePreviewStore';
import { projectRepository as defaultRepository } from '../repositoryInstance';
import { computeDirty } from './dirty';
import { parseProjectImport } from '../importExport';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmPending {
  readonly kind: 'new' | 'open' | 'delete' | 'import';
  readonly projectId?: string;
  readonly projectName?: string;
}

/** Data staged for import, awaiting confirmation when workspace is dirty. */
interface PendingImport {
  readonly name: string;
  readonly data: ProjectData;
}

export interface ProjectManagerState {
  /** ID of the currently open project, or null for an unsaved workspace. */
  currentId: string | null;
  /** Display name of the current project. */
  name: string;
  /** Serialized snapshot of the last successfully persisted data, or null. */
  savedData: ProjectData | null;
  /** Last persisted name, or null if never saved. */
  savedName: string | null;
  /** Derived dirty state. */
  isDirty: boolean;
  /** Whether a save/load/delete operation is in progress. */
  busy: boolean;
  /** Last error message (null = no error). */
  error: string | null;
  /** Whether the Open menu is visible. */
  openMenuOpen: boolean;
  /** Pending confirmation request, or null. */
  pendingConfirm: ConfirmPending | null;
  /** Data staged for import, awaiting confirmation when workspace is dirty. */
  pendingImport: PendingImport | null;
  /** Info/success message (null = no message). */
  info: string | null;
}

export interface ProjectManagerActions {
  /** Initialize from a booted project (called from main.tsx after restoreLastProject). */
  initialize: (booted: BootedProject | null) => void;
  /** Create a new empty workspace (confirms if dirty). */
  newProject: () => void;
  /** Open a saved project by ID (confirms if dirty). */
  openProject: (id: string) => void;
  /** Save the current workspace (creates if new, updates if existing). */
  saveProject: () => boolean;
  /** Update the project name (marks dirty). */
  rename: (name: string) => void;
  /** Delete a project by ID (confirms; resets workspace if current). */
  deleteProject: (id: string) => void;
  /** Import a validated project from text. Returns true on success. */
  importProject: (text: string) => boolean;
  /** Confirm the pending confirmation. */
  confirmPending: () => void;
  /** Cancel the pending confirmation. */
  cancelPending: () => void;
  /** Toggle the Open menu. */
  toggleOpenMenu: () => void;
  /** Close the Open menu. */
  closeOpenMenu: () => void;
  /** Dismiss the current error. */
  dismissError: () => void;
  /** Dismiss the current info message. */
  dismissInfo: () => void;
  /** Recompute dirty from current preview store state. */
  recomputeDirty: () => void;
}

// ---------------------------------------------------------------------------
// Actions implementation
// ---------------------------------------------------------------------------

function buildActions(
  get: () => ProjectManagerState,
  set: (partial: Partial<ProjectManagerState>) => void,
  repo: ProjectRepository
): ProjectManagerActions {
  function getCurrentData(): ProjectData {
    return toProjectData(usePreviewStore.getState());
  }

  function recomputeDirty() {
    const state = get();
    const currentData = getCurrentData();
    const dirty = computeDirty(
      currentData,
      state.savedData,
      state.name,
      state.savedName
    );
    if (dirty !== state.isDirty) set({ isDirty: dirty });
  }

  function showError(msg: string) {
    set({ error: msg });
  }

  function hydrateFromData(data: ProjectData) {
    usePreviewStore.getState().hydrate(toHydratePayload(data));
  }

  function resetWorkspace() {
    usePreviewStore.getState().reset();
  }

  function performImport(imported: PendingImport) {
    set({ busy: true, error: null });
    const result = repo.create(imported.data, imported.name);
    if (!result.ok) {
      set({ busy: false });
      showError(`Could not import project: ${result.reason}`);
      return;
    }
    const record = result.value;
    hydrateFromData(record.data);
    repo.setLastOpened(record.id);
    set({
      currentId: record.id,
      name: record.meta.name,
      savedData: record.data,
      savedName: record.meta.name,
      isDirty: false,
      busy: false,
      pendingConfirm: null,
      pendingImport: null,
      info: `Imported "${record.meta.name}".`,
    });
  }

  return {
    initialize(booted) {
      if (booted === null) {
        // No project restored; workspace is in default reset state
        set({
          currentId: null,
          name: '',
          savedData: null,
          savedName: null,
          isDirty: false,
        });
        return;
      }

      // reflect the exact booted project
      set({
        currentId: booted.id,
        name: booted.name,
        savedData: booted.data,
        savedName: booted.name,
        isDirty: false,
      });
    },

    newProject() {
      if (get().busy) return;
      if (get().isDirty) {
        set({ pendingConfirm: { kind: 'new' } });
        return;
      }
      resetWorkspace();
      repo.setLastOpened(null);
      set({
        currentId: null,
        name: '',
        savedData: null,
        savedName: null,
        isDirty: false,
        error: null,
      });
    },

    openProject(id) {
      if (get().busy) return;
      if (id === get().currentId) return;
      if (get().isDirty) {
        set({ pendingConfirm: { kind: 'open', projectId: id } });
        return;
      }
      const result = repo.get(id);
      if (!result.ok) {
        showError(`Could not open project: ${result.reason}`);
        return;
      }
      const record = result.value;
      hydrateFromData(record.data);
      repo.setLastOpened(record.id);
      set({
        currentId: record.id,
        name: record.meta.name,
        savedData: record.data,
        savedName: record.meta.name,
        isDirty: false,
        error: null,
      });
    },

    saveProject() {
      const state = get();
      if (state.busy) return false;

      const data = getCurrentData();
      const projectName = normalizeName(state.name);

      set({ busy: true, error: null });

      if (state.currentId === null) {
        // Create new project
        const result = repo.create(data, projectName);
        set({ busy: false });
        if (!result.ok) {
          showError(`Could not save project: ${result.reason}`);
          return false;
        }
        const record = result.value;
        repo.setLastOpened(record.id);
        set({
          currentId: record.id,
          name: record.meta.name,
          savedData: record.data,
          savedName: record.meta.name,
          isDirty: false,
        });
        return true;
      }

      // Update existing project
      const existing = repo.get(state.currentId);
      if (!existing.ok) {
        set({ busy: false, savedData: null, savedName: null });
        showError('Project no longer exists. Create a new project instead.');
        recomputeDirty();
        return false;
      }

      const savedRecord = {
        ...existing.value,
        meta: { ...existing.value.meta, name: projectName },
        data,
      };
      const ok = repo.save(savedRecord);
      set({ busy: false });
      if (!ok) {
        showError('Could not save project — storage may be full.');
        return false;
      }
      repo.setLastOpened(state.currentId);
      set({
        name: projectName,
        savedData: data,
        savedName: projectName,
        isDirty: false,
      });
      return true;
    },

    rename(name) {
      set({ name });
      recomputeDirty();
    },

    deleteProject(id) {
      if (get().busy) return;
      const summaries = repo.list();
      const summary = summaries.find((s) => s.id === id);
      set({
        pendingConfirm: {
          kind: 'delete',
          projectId: id,
          projectName: summary?.name ?? 'Untitled project',
        },
      });
    },

    importProject(text) {
      if (get().busy) return false;

      const parseResult = parseProjectImport(text);
      if (!parseResult.ok) {
        showError(`Import failed: ${parseResult.reason}`);
        return false;
      }

      const record = parseResult.value;

      if (get().isDirty) {
        set({
          pendingConfirm: { kind: 'import' },
          pendingImport: { name: record.meta.name, data: record.data },
        });
        return true;
      }

      performImport({ name: record.meta.name, data: record.data });
      return true;
    },

    confirmPending() {
      const pending = get().pendingConfirm;
      if (!pending) return;
      set({ pendingConfirm: null, busy: true });

      switch (pending.kind) {
        case 'new': {
          resetWorkspace();
          repo.setLastOpened(null);
          set({
            currentId: null,
            name: '',
            savedData: null,
            savedName: null,
            isDirty: false,
            busy: false,
          });
          break;
        }

        case 'open': {
          const id = pending.projectId!;
          const result = repo.get(id);
          if (!result.ok) {
            set({ busy: false });
            showError(`Could not open project: ${result.reason}`);
            return;
          }
          const record = result.value;
          hydrateFromData(record.data);
          repo.setLastOpened(record.id);
          set({
            currentId: record.id,
            name: record.meta.name,
            savedData: record.data,
            savedName: record.meta.name,
            isDirty: false,
            busy: false,
          });
          break;
        }

        case 'delete': {
          const id = pending.projectId!;
          const wasCurrent = get().currentId === id;
          repo.remove(id);
          if (wasCurrent) {
            resetWorkspace();
            set({
              currentId: null,
              name: '',
              savedData: null,
              savedName: null,
            });
          }
          set({ isDirty: wasCurrent ? false : get().isDirty, busy: false });
          break;
        }

        case 'import': {
          const staged = get().pendingImport;
          if (!staged) {
            set({ busy: false });
            return;
          }
          performImport(staged);
          break;
        }
      }
    },

    cancelPending() {
      set({ pendingConfirm: null, pendingImport: null });
    },

    toggleOpenMenu() {
      set({ openMenuOpen: !get().openMenuOpen });
    },

    closeOpenMenu() {
      set({ openMenuOpen: false });
    },

    dismissError() {
      set({ error: null });
    },

    dismissInfo() {
      set({ info: null });
    },

    recomputeDirty,
  };
}

// ---------------------------------------------------------------------------
// Store factory (injectable for tests)
// ---------------------------------------------------------------------------

export function createProjectManagerStore(
  repo: ProjectRepository,
  opts?: { subscribeToPreview?: boolean }
) {
  const store = create<ProjectManagerState & ProjectManagerActions>()(
    (set, get) => ({
      currentId: null,
      name: '',
      savedData: null,
      savedName: null,
      isDirty: false,
      busy: false,
      error: null,
      openMenuOpen: false,
      pendingConfirm: null,
      pendingImport: null,
      info: null,
      ...buildActions(
        get,
        set as (p: Partial<ProjectManagerState>) => void,
        repo
      ),
    })
  );

  if (opts?.subscribeToPreview) {
    usePreviewStore.subscribe(() => {
      store.getState().recomputeDirty();
    });
  }

  return store;
}

// ---------------------------------------------------------------------------
// Default singleton (localStorage-backed)
// ---------------------------------------------------------------------------

/** Default project manager store backed by localStorage. */
export const useProjectManagerStore = createProjectManagerStore(
  defaultRepository,
  { subscribeToPreview: true }
);
