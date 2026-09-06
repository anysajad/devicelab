import { beforeEach, describe, expect, it } from 'vitest';

import { createProjectManagerStore } from '../useProjectManagerStore';
import { usePreviewStore } from '../../../preview/store/usePreviewStore';
import { createProjectRepository } from '../../repository';
import { createMemoryAdapter } from '../../storage';
import type { ProjectData, StorageAdapter } from '../../types';
import { toHydratePayload } from '../../serializer';
import type { BootedProject } from '../../bootstrap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<ProjectData>): ProjectData {
  return {
    sharedUrl: 'https://example.com',
    entries: [
      { id: 'preview-1', deviceId: 'iphone-15', orientation: 'portrait' },
    ],
    layoutMode: 'grid',
    compareIds: [],
    activeId: null,
    ...overrides,
  };
}

function createManagerWithMemoryRepo() {
  const adapter = createMemoryAdapter();
  const repo = createProjectRepository(adapter);
  const store = createProjectManagerStore(repo, { subscribeToPreview: true });
  return { store, repo, adapter };
}

function createFailingAdapter(): StorageAdapter {
  return {
    getItem: () => null,
    setItem: () => false,
    removeItem: () => {},
    keys: () => [],
  };
}

/** Simulate boot: hydrate preview store + init manager. */
function simulateBoot(
  store: ReturnType<typeof createProjectManagerStore>,
  booted: BootedProject
) {
  usePreviewStore.getState().hydrate(toHydratePayload(booted.data));
  store.getState().initialize(booted);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectManagerStore', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  describe('initialize', () => {
    it('sets currentId from booted project', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-123',
        name: 'Booted Project',
        data: makeData(),
      };
      store.getState().initialize(booted);
      expect(store.getState().currentId).toBe('proj-123');
    });

    it('sets name from booted project', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-123',
        name: 'Booted Project',
        data: makeData(),
      };
      store.getState().initialize(booted);
      expect(store.getState().name).toBe('Booted Project');
    });

    it('sets savedData from booted project', () => {
      const { store } = createManagerWithMemoryRepo();
      const data = makeData({ sharedUrl: 'https://booted.com' });
      const booted: BootedProject = {
        id: 'proj-123',
        name: 'Booted',
        data,
      };
      store.getState().initialize(booted);
      expect(store.getState().savedData).toEqual(data);
    });

    it('is clean after initialization', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-123',
        name: 'Clean',
        data: makeData(),
      };
      store.getState().initialize(booted);
      expect(store.getState().isDirty).toBe(false);
    });

    it('initializes to null state when no project booted', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      expect(store.getState().currentId).toBeNull();
      expect(store.getState().name).toBe('');
      expect(store.getState().savedData).toBeNull();
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('newProject', () => {
    it('resets workspace when not dirty', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.getState().newProject();
      expect(store.getState().currentId).toBeNull();
      expect(store.getState().isDirty).toBe(false);
    });

    it('shows confirmation when dirty', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Test',
        data: makeData(),
      };
      store.getState().initialize(booted);
      // Make it dirty by changing the workspace
      usePreviewStore.getState().addEntry('ipad');
      store.getState().recomputeDirty();
      expect(store.getState().isDirty).toBe(true);

      store.getState().newProject();
      expect(store.getState().pendingConfirm).not.toBeNull();
      expect(store.getState().pendingConfirm?.kind).toBe('new');
    });

    it('does not reset if busy', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.setState({ busy: true });
      store.getState().newProject();
      expect(store.getState().pendingConfirm).toBeNull();
    });
  });

  describe('rename', () => {
    it('updates name and marks dirty', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Original',
        data: makeData(),
      };
      simulateBoot(store, booted);
      expect(store.getState().isDirty).toBe(false);

      store.getState().rename('New Name');
      expect(store.getState().name).toBe('New Name');
      expect(store.getState().isDirty).toBe(true);
    });

    it('does not mark dirty if name unchanged', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Test',
        data: makeData(),
      };
      simulateBoot(store, booted);
      store.getState().rename('Test');
      // savedData is set, no data change — name same → clean
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('saveProject (new project)', () => {
    it('creates a new project and sets currentId', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.getState().rename('My Project');
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();

      const ok = store.getState().saveProject();
      expect(ok).toBe(true);
      expect(store.getState().currentId).not.toBeNull();
      expect(store.getState().name).toBe('My Project');
      expect(store.getState().isDirty).toBe(false);
    });

    it('sets savedData after successful save', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();

      store.getState().saveProject();
      expect(store.getState().savedData).not.toBeNull();
      expect(store.getState().savedData?.entries).toHaveLength(1);
    });

    it('returns false on storage failure', () => {
      const failingRepo = createProjectRepository(createFailingAdapter());
      const store = createProjectManagerStore(failingRepo);
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();

      const ok = store.getState().saveProject();
      expect(ok).toBe(false);
      expect(store.getState().currentId).toBeNull();
      expect(store.getState().error).not.toBeNull();
    });

    it('leaves dirty on storage failure', () => {
      const failingRepo = createProjectRepository(createFailingAdapter());
      const store = createProjectManagerStore(failingRepo);
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();

      store.getState().saveProject();
      expect(store.getState().isDirty).toBe(true);
    });

    it('does not save if busy', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.setState({ busy: true });
      const ok = store.getState().saveProject();
      expect(ok).toBe(false);
    });
  });

  describe('saveProject (existing project)', () => {
    it('preserves createdAt on update', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();

      const currentId = store.getState().currentId!;
      const existing = repo.get(currentId);
      expect(existing.ok).toBe(true);
      if (!existing.ok) return;
      const originalCreatedAt = existing.value.meta.createdAt;

      // Modify workspace
      usePreviewStore.getState().addEntry('ipad');
      store.getState().saveProject();

      const updated = repo.get(currentId);
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.meta.createdAt).toBe(originalCreatedAt);
      }
    });

    it('returns error when project disappeared externally', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();

      const currentId = store.getState().currentId!;
      repo.remove(currentId); // simulate external deletion

      const ok = store.getState().saveProject();
      expect(ok).toBe(false);
      expect(store.getState().error).toContain('no longer exists');
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('openProject', () => {
    it('loads a project', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();
      const id = store.getState().currentId!;

      // Reset workspace
      store.getState().newProject();
      expect(store.getState().currentId).toBeNull();

      // Open
      store.getState().openProject(id);
      expect(store.getState().currentId).toBe(id);
      expect(store.getState().name).not.toBe('');
    });

    it('restores entries and URL', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().setSharedUrl('https://example.com');
      usePreviewStore.getState().addEntry('iphone-15');
      usePreviewStore.getState().addEntry('ipad');
      store.getState().saveProject();
      const id = store.getState().currentId!;

      // Reset and open
      store.getState().newProject();
      store.getState().openProject(id);
      expect(usePreviewStore.getState().entries).toHaveLength(2);
      expect(usePreviewStore.getState().sharedUrl).toBe('https://example.com');
    });

    it('restores custom viewport and compare configuration', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      const id1 = usePreviewStore.getState().addEntry('iphone-15');
      const id2 = usePreviewStore.getState().addEntry('ipad');
      usePreviewStore.getState().enterCompareMode([id1, id2]);
      usePreviewStore.getState().updateEntry(id1, {
        viewportMode: 'custom',
        deviceId: '__custom__',
        customViewportWidth: 1024,
        customViewportHeight: 768,
      });
      store.getState().saveProject();
      const projId = store.getState().currentId!;

      // Reset and open
      store.getState().newProject();
      store.getState().openProject(projId);
      const entries = usePreviewStore.getState().entries;
      expect(entries).toHaveLength(2);
      expect(usePreviewStore.getState().layoutMode).toBe('compare');
      const custom = entries.find((e) => e.viewportMode === 'custom');
      expect(custom).toBeDefined();
      expect(custom?.customViewportWidth).toBe(1024);
      expect(custom?.customViewportHeight).toBe(768);
    });

    it('shows confirmation when dirty', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();
      const id = store.getState().currentId!;

      // Make dirty
      store.getState().rename('Dirty Name');
      expect(store.getState().isDirty).toBe(true);

      // Open another project — need a second project
      usePreviewStore.getState().reset();
      store.setState({
        currentId: null,
        savedData: null,
        savedName: null,
        isDirty: false,
      });
      store.getState().rename('Second');
      usePreviewStore.getState().addEntry('ipad');
      store.getState().saveProject();
      const id2 = store.getState().currentId!;

      // Switch back to first, make dirty, try to open second
      store.getState().openProject(id);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();
      store.getState().openProject(id2);
      expect(store.getState().pendingConfirm?.kind).toBe('open');
    });

    it('does not open if busy', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.setState({ busy: true });
      store.getState().openProject('any');
      expect(store.getState().pendingConfirm).toBeNull();
    });

    it('does not open same project', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Same',
        data: makeData(),
      };
      store.getState().initialize(booted);
      store.getState().openProject('proj-1');
      expect(store.getState().pendingConfirm).toBeNull();
    });

    it('shows error for missing project', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      store.getState().openProject('nonexistent');
      expect(store.getState().error).toContain('Could not open');
      expect(store.getState().currentId).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('shows confirmation for deletion', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().deleteProject('proj-123');
      expect(store.getState().pendingConfirm?.kind).toBe('delete');
      expect(store.getState().pendingConfirm?.projectId).toBe('proj-123');
    });

    it('confirmPending: deletes non-current project', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();
      const id = store.getState().currentId!;

      // Create second project
      usePreviewStore.getState().reset();
      store.setState({
        currentId: null,
        savedData: null,
        savedName: null,
        isDirty: false,
      });
      store.getState().rename('Second');
      usePreviewStore.getState().addEntry('ipad');
      store.getState().saveProject();
      const id2 = store.getState().currentId!;

      // Delete the first (not current)
      store.getState().deleteProject(id);
      expect(store.getState().pendingConfirm).not.toBeNull();
      store.getState().confirmPending();
      expect(repo.get(id).ok).toBe(false);
      expect(store.getState().currentId).toBe(id2);
    });

    it('confirmPending: deletes current project and resets', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().saveProject();
      const id = store.getState().currentId!;

      store.getState().deleteProject(id);
      store.getState().confirmPending();
      expect(repo.get(id).ok).toBe(false);
      expect(store.getState().currentId).toBeNull();
      expect(store.getState().name).toBe('');
    });

    it('does not delete if busy', () => {
      const { store } = createManagerWithMemoryRepo();
      store.setState({ busy: true });
      store.getState().deleteProject('any');
      expect(store.getState().pendingConfirm).toBeNull();
    });
  });

  describe('confirmation flow', () => {
    it('cancelPending clears pendingConfirm', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().deleteProject('proj-1');
      expect(store.getState().pendingConfirm).not.toBeNull();
      store.getState().cancelPending();
      expect(store.getState().pendingConfirm).toBeNull();
    });

    it('cancelPending leaves workspace untouched', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Original',
        data: makeData(),
      };
      store.getState().initialize(booted);
      usePreviewStore.getState().addEntry('ipad');
      store.getState().recomputeDirty();
      expect(store.getState().isDirty).toBe(true);

      store.getState().newProject(); // triggers confirm
      store.getState().cancelPending();
      expect(store.getState().currentId).toBe('proj-1');
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('dirty state', () => {
    it('becomes dirty when entry added', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Test',
        data: makeData(),
      };
      store.getState().initialize(booted);
      expect(store.getState().isDirty).toBe(false);

      usePreviewStore.getState().addEntry('ipad');
      store.getState().recomputeDirty();
      expect(store.getState().isDirty).toBe(true);
    });

    it('becomes clean after save', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().initialize(null);
      usePreviewStore.getState().addEntry('iphone-15');
      store.getState().recomputeDirty();
      expect(store.getState().isDirty).toBe(true);

      store.getState().saveProject();
      expect(store.getState().isDirty).toBe(false);
    });

    it('runtime-only changes do not make dirty', () => {
      const { store } = createManagerWithMemoryRepo();
      const booted: BootedProject = {
        id: 'proj-1',
        name: 'Test',
        data: makeData(),
      };
      simulateBoot(store, booted);
      expect(store.getState().isDirty).toBe(false);

      // Lifecycle status change (runtime-only)
      usePreviewStore.getState().updateLifecycleStatus('preview-1', 'ready');
      store.getState().recomputeDirty();
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('error handling', () => {
    it('dismissError clears error', () => {
      const { store } = createManagerWithMemoryRepo();
      store.setState({ error: 'Something failed' });
      store.getState().dismissError();
      expect(store.getState().error).toBeNull();
    });
  });
});
