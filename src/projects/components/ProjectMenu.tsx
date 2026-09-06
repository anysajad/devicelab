import { useCallback, useEffect, useRef } from 'react';

import type { ProjectSummary } from '../types';
import { useProjectManagerStore } from '../manager/useProjectManagerStore';

interface ProjectMenuProps {
  /** The list of saved projects. */
  projects: ProjectSummary[];
}

/**
 * Project menu dropdown listing available projects.
 * Each row has Open and Delete actions.
 * Closes on outside click or Escape.
 */
export function ProjectMenu({ projects }: ProjectMenuProps) {
  const openId = useProjectManagerStore((s) => s.currentId);
  const openProject = useProjectManagerStore((s) => s.openProject);
  const deleteProject = useProjectManagerStore((s) => s.deleteProject);
  const closeMenu = useProjectManagerStore((s) => s.closeOpenMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeMenu]);

  // Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeMenu]);

  const handleOpen = useCallback(
    (id: string) => {
      closeMenu();
      openProject(id);
    },
    [closeMenu, openProject]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteProject(id);
    },
    [deleteProject]
  );

  function formatRelativeTime(isoDate: string): string {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      role="menu"
      aria-label="Open project"
    >
      <div className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Recent projects
      </div>
      {projects.length === 0 && (
        <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
          No saved projects
        </div>
      )}
      {projects.map((p) => (
        <div
          key={p.id}
          className={`flex items-center justify-between px-3 py-2 text-sm transition-colors ${
            p.id === openId
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
        >
          <button
            type="button"
            onClick={() => handleOpen(p.id)}
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5"
            role="menuitem"
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatRelativeTime(p.updatedAt)}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => handleDelete(e, p.id)}
            className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950 dark:hover:text-red-400"
            aria-label={`Delete ${p.name}`}
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
        </div>
      ))}
    </div>
  );
}
