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

    it('dismissInfo clears info', () => {
      const { store } = createManagerWithMemoryRepo();
      store.setState({ info: 'All good' });
      store.getState().dismissInfo();
      expect(store.getState().info).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Import tests
  // -----------------------------------------------------------------------

  describe('importProject', () => {
    function validImportJson(
      overrides?: Partial<Record<string, unknown>>
    ): string {
      return JSON.stringify({
        schemaVersion: 1,
        id: 'import-file-id',
        meta: {
          name: 'Imported Project',
          createdAt: '2025-03-10T12:00:00Z',
          updatedAt: '2025-03-10T12:30:00Z',
        },
        data: {
          sharedUrl: 'https://imported.example.com',
          entries: [
            {
              id: 'import-entry-1',
              deviceId: 'iphone-15',
              orientation: 'portrait',
            },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
        ...overrides,
      });
    }

    it('imports a valid project and persists it', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      const text = validImportJson();

      const result = store.getState().importProject(text);
      expect(result).toBe(true);

      const state = store.getState();
      expect(state.currentId).not.toBeNull();
      expect(state.currentId).not.toBe('import-file-id');
      expect(state.name).toBe('Imported Project');
      expect(state.isDirty).toBe(false);
      expect(state.info).toContain('Imported');

      // Verify persisted in repo
      const list = repo.list();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Imported Project');
    });

    it('generates a fresh ID (not the file ID)', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());
      const newId = store.getState().currentId;

      expect(newId).not.toBe('import-file-id');
      expect(newId).toBeTruthy();
    });

    it('sets lastOpened to the new ID', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());

      expect(repo.getLastOpened()).toBe(store.getState().currentId);
    });

    it('hydrates the preview store with imported data', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());

      const preview = usePreviewStore.getState();
      expect(preview.sharedUrl).toBe('https://imported.example.com');
      expect(preview.entries).toHaveLength(1);
      expect(preview.entries[0]!.deviceId).toBe('iphone-15');
    });

    it('shows info message on success', () => {
      const { store } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());
      expect(store.getState().info).toContain('Imported');
    });

    it('sets pendingConfirm when workspace is dirty', () => {
      const { store } = createManagerWithMemoryRepo();

      // Create a saved project and make it dirty
      usePreviewStore.getState().hydrate(
        toHydratePayload({
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        })
      );
      store.getState().initialize({
        id: 'existing',
        name: 'Existing',
        data: {
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      // Make dirty
      usePreviewStore.getState().addEntry('ipad');

      const result = store.getState().importProject(validImportJson());
      expect(result).toBe(true);

      const state = store.getState();
      expect(state.pendingConfirm).not.toBeNull();
      expect(state.pendingConfirm!.kind).toBe('import');
      expect(state.pendingImport).not.toBeNull();
      expect(state.pendingImport!.name).toBe('Imported Project');

      // Workspace not yet changed
      expect(state.currentId).toBe('existing');
    });

    it('confirmPending completes import after dirty', () => {
      const { store } = createManagerWithMemoryRepo();

      // Make workspace dirty
      usePreviewStore.getState().hydrate(
        toHydratePayload({
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        })
      );
      store.getState().initialize({
        id: 'existing',
        name: 'Existing',
        data: {
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      usePreviewStore.getState().addEntry('ipad');

      // Import with dirty
      store.getState().importProject(validImportJson());
      expect(store.getState().pendingConfirm!.kind).toBe('import');

      // Confirm
      store.getState().confirmPending();

      const state = store.getState();
      expect(state.currentId).not.toBe('existing');
      expect(state.currentId).not.toBeNull();
      expect(state.name).toBe('Imported Project');
      expect(state.pendingConfirm).toBeNull();
      expect(state.pendingImport).toBeNull();
      expect(state.isDirty).toBe(false);
      expect(state.info).toContain('Imported');
    });

    it('cancelPending discards import', () => {
      const { store, repo } = createManagerWithMemoryRepo();

      // Make workspace dirty
      usePreviewStore.getState().hydrate(
        toHydratePayload({
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        })
      );
      store.getState().initialize({
        id: 'existing',
        name: 'Existing',
        data: {
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        },
      });
      usePreviewStore.getState().addEntry('ipad');

      store.getState().importProject(validImportJson());
      store.getState().cancelPending();

      const state = store.getState();
      expect(state.pendingConfirm).toBeNull();
      expect(state.pendingImport).toBeNull();
      expect(state.currentId).toBe('existing');
      expect(repo.list()).toHaveLength(0);
    });

    it('rejects invalid JSON and shows error', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      const result = store.getState().importProject('not valid json');
      expect(result).toBe(false);
      expect(store.getState().error).toContain('Import failed');
      expect(repo.list()).toHaveLength(0);
    });

    it('rejects invalid schema and shows error', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      const result = store
        .getState()
        .importProject(JSON.stringify({ schemaVersion: 99 }));
      expect(result).toBe(false);
      expect(store.getState().error).toContain('Import failed');
      expect(repo.list()).toHaveLength(0);
    });

    it('rejects duplicate names (allowed, both coexist)', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());
      store.getState().importProject(validImportJson());

      const list = repo.list();
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe('Imported Project');
      expect(list[1]!.name).toBe('Imported Project');
      expect(list[0]!.id).not.toBe(list[1]!.id);
    });

    it('returns false when busy', () => {
      const { store } = createManagerWithMemoryRepo();
      store.setState({ busy: true });
      const result = store.getState().importProject(validImportJson());
      expect(result).toBe(false);
    });

    it('preserves existing saved project on import', () => {
      const { store, repo } = createManagerWithMemoryRepo();

      // Save a project first through normal flow
      usePreviewStore.getState().hydrate(
        toHydratePayload({
          sharedUrl: 'https://example.com',
          entries: [
            { id: 'e1', deviceId: 'iphone-15', orientation: 'portrait' },
          ],
          layoutMode: 'grid',
          compareIds: [],
          activeId: null,
        })
      );
      store.getState().saveProject(); // creates new project since currentId is null
      const existingId = store.getState().currentId;

      // Import new project
      store.getState().importProject(validImportJson());

      // Both exist
      const list = repo.list();
      expect(list).toHaveLength(2);
      const names = list.map((s) => s.name).sort();
      expect(names).toContain('Imported Project');
      // The existing project still exists with its original name
      expect(list.find((s) => s.id === existingId)).toBeDefined();
    });

    it('import persists immediately (survives reload)', () => {
      const { store, repo } = createManagerWithMemoryRepo();
      store.getState().importProject(validImportJson());

      const id = store.getState().currentId!;
      const result = repo.get(id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.meta.name).toBe('Imported Project');
        expect(result.value.data.sharedUrl).toBe(
          'https://imported.example.com'
        );
      }
    });

    it('import with storage failure shows error', () => {
      const adapter = createFailingAdapter();
      const repo = createProjectRepository(adapter);
      const store = createProjectManagerStore(repo, {
        subscribeToPreview: true,
      });

      const result = store.getState().importProject(validImportJson());
      expect(result).toBe(true); // parse succeeded

      // confirmPending to trigger persist (clean workspace, immediate import)
      store.getState().confirmPending();

      expect(store.getState().error).toContain('Could not import');
      expect(store.getState().currentId).toBeNull();
    });

    it('custom viewport and compare round-trip', () => {
      const { store } = createManagerWithMemoryRepo();
      const record = {
        schemaVersion: 1,
        id: 'file-id',
        meta: {
          name: 'Custom Test',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        },
        data: {
          sharedUrl: 'https://test.com',
          entries: [
            {
              id: 'c1',
              deviceId: '__custom__',
              orientation: 'portrait',
              viewportMode: 'custom',
              customViewportWidth: 375,
              customViewportHeight: 812,
              customUrl: 'https://custom.url',
            },
            {
              id: 'p1',
              deviceId: 'iphone-15',
              orientation: 'landscape',
            },
          ],
          layoutMode: 'compare',
          compareIds: ['c1', 'p1'],
          activeId: 'c1',
        },
      };
      store.getState().importProject(JSON.stringify(record));

      const preview = usePreviewStore.getState();
      expect(preview.entries).toHaveLength(2);
      expect(preview.entries[0]!.viewportMode).toBe('custom');
      expect(preview.entries[0]!.customViewportWidth).toBe(375);
      expect(preview.entries[0]!.customUrl).toBe('https://custom.url');
      expect(preview.layoutMode).toBe('compare');
      expect(preview.compareIds).toEqual(['c1', 'p1']);
      expect(preview.activeId).toBe('c1');
    });
  });
});
