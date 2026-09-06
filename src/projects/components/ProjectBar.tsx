import { useCallback, useEffect, useRef, useState } from 'react';

import { projectRepository } from '../repositoryInstance';
import { useProjectManagerStore } from '../manager/useProjectManagerStore';
import {
  exportProjectRecord,
  generateExportFilename,
  downloadTextFile,
} from '../importExport';
import { ConfirmDialog } from './ConfirmDialog';
import { Notice } from './Notice';
import { ProjectMenu } from './ProjectMenu';

const CONFIRM_MESSAGES: Record<
  string,
  {
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
  }
> = {
  new: {
    title: 'Discard unsaved changes?',
    message:
      'You have unsaved changes. Creating a new project will discard them.',
    confirmLabel: 'Discard',
  },
  open: {
    title: 'Discard unsaved changes?',
    message:
      'You have unsaved changes. Opening another project will discard them.',
    confirmLabel: 'Discard',
  },
  delete: {
    title: 'Delete project?',
    message: 'This project will be permanently deleted. This cannot be undone.',
    confirmLabel: 'Delete',
    destructive: true,
  },
  import: {
    title: 'Replace workspace?',
    message: 'You have unsaved changes. Importing a project will discard them.',
    confirmLabel: 'Import',
  },
};

/**
 * ProjectBar — header controls for project management.
 *
 * Shows the current project name (editable), dirty indicator,
 * and New / Open / Save / Delete / Import / Export actions.
 * Mounted in the Layout header.
 */
export function ProjectBar() {
  const currentId = useProjectManagerStore((s) => s.currentId);
  const name = useProjectManagerStore((s) => s.name);
  const isDirty = useProjectManagerStore((s) => s.isDirty);
  const busy = useProjectManagerStore((s) => s.busy);
  const error = useProjectManagerStore((s) => s.error);
  const info = useProjectManagerStore((s) => s.info);
  const openMenuOpen = useProjectManagerStore((s) => s.openMenuOpen);
  const pendingConfirm = useProjectManagerStore((s) => s.pendingConfirm);

  const newProject = useProjectManagerStore((s) => s.newProject);
  const toggleOpenMenu = useProjectManagerStore((s) => s.toggleOpenMenu);
  const saveProject = useProjectManagerStore((s) => s.saveProject);
  const deleteCurrent = useProjectManagerStore((s) => s.deleteProject);
  const rename = useProjectManagerStore((s) => s.rename);
  const importProject = useProjectManagerStore((s) => s.importProject);
  const confirmPending = useProjectManagerStore((s) => s.confirmPending);
  const cancelPending = useProjectManagerStore((s) => s.cancelPending);
  const dismissError = useProjectManagerStore((s) => s.dismissError);
  const dismissInfo = useProjectManagerStore((s) => s.dismissInfo);

  const [nameInput, setNameInput] = useState(name);
  const [editingName, setEditingName] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync name input when store name changes (e.g. after save/open/boot)
  useEffect(() => {
    setNameInput(name);
  }, [name]);

  // Focus the name input when editing starts
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleNameBlur = useCallback(() => {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed !== name) {
      rename(trimmed || 'Untitled project');
    }
  }, [nameInput, name, rename]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        nameInputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setNameInput(name);
        setEditingName(false);
      }
    },
    [name]
  );

  const handleSave = useCallback(() => {
    saveProject();
  }, [saveProject]);

  const handleDelete = useCallback(() => {
    if (currentId) deleteCurrent(currentId);
  }, [currentId, deleteCurrent]);

  // --- Import ---
  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so re-selecting the same file fires change
      e.target.value = '';

      try {
        const text = await file.text();
        importProject(text);
      } catch {
        // File read error — show error via store
        importProject('invalid');
      }
    },
    [importProject]
  );

  // --- Export ---
  const handleExport = useCallback(() => {
    if (!currentId) return;

    const result = projectRepository.get(currentId);
    if (!result.ok) return;

    const record = result.value;
    const json = exportProjectRecord(record);
    const filename = generateExportFilename(record.meta.name);
    downloadTextFile(filename, json);
  }, [currentId]);

  const handleExportClick = useCallback(() => {
    if (isDirty) {
      setExportConfirm(true);
      return;
    }
    handleExport();
  }, [isDirty, handleExport]);

  // Fetch project list for menu (re-rendered when menu toggles)
  const projects = openMenuOpen ? projectRepository.list() : [];

  const confirmInfo = pendingConfirm
    ? CONFIRM_MESSAGES[pendingConfirm.kind]
    : null;

  return (
    <>
      {error && <Notice message={error} onDismiss={dismissError} />}
      {info && <Notice message={info} variant="info" onDismiss={dismissInfo} />}

      <div className="flex items-center gap-2">
        {/* Project name (editable) */}
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="w-48 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
            aria-label={`Project: ${name || 'Untitled project'}. Click to rename.`}
          >
            <span className="max-w-[160px] truncate">
              {name || 'Untitled project'}
            </span>
            {isDirty && (
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-amber-500"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
          </button>
        )}

        {/* Separator */}
        <div
          className="h-4 w-px bg-gray-200 dark:bg-gray-700"
          aria-hidden="true"
        />

        {/* New */}
        <button
          type="button"
          onClick={newProject}
          disabled={busy}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="New project"
        >
          New
        </button>

        {/* Open */}
        <div className="relative">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggleOpenMenu}
            disabled={busy}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open project"
            aria-expanded={openMenuOpen}
            aria-haspopup="true"
          >
            Open
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {openMenuOpen && <ProjectMenu projects={projects} />}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          aria-label="Save project"
        >
          Save
        </button>

        {/* Delete (only when a project is open) */}
        {currentId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-400"
            aria-label="Delete project"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}

        {/* Separator */}
        <div
          className="h-4 w-px bg-gray-200 dark:bg-gray-700"
          aria-hidden="true"
        />

        {/* Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="sr-only"
          aria-label="Import project file"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Import project"
        >
          Import
        </button>

        {/* Export */}
        <button
          type="button"
          onClick={handleExportClick}
          disabled={busy || !currentId}
          title={!currentId ? 'Save a project before exporting' : undefined}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Export project"
        >
          Export
        </button>
      </div>

      {/* Store confirmation dialog (new/open/delete/import) */}
      {pendingConfirm && confirmInfo && (
        <ConfirmDialog
          title={confirmInfo.title}
          message={
            pendingConfirm.kind === 'delete' && pendingConfirm.projectName
              ? `${confirmInfo.message}\n\nProject: ${pendingConfirm.projectName}`
              : confirmInfo.message
          }
          confirmLabel={confirmInfo.confirmLabel}
          destructive={confirmInfo.destructive}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}

      {/* Local export confirm dialog (dirty workspace) */}
      {exportConfirm && (
        <ConfirmDialog
          title="Export saved version?"
          message="You have unsaved changes. The last saved version will be exported."
          confirmLabel="Export"
          onConfirm={() => {
            setExportConfirm(false);
            handleExport();
          }}
          onCancel={() => setExportConfirm(false)}
        />
      )}
    </>
  );
}
