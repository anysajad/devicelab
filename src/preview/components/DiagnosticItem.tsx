import { useCallback } from 'react';

import type {
  Diagnostic,
  DiagnosticSeverity,
  ElementReference,
} from '@/inspection';
import type { PreviewBackend } from '../backend';
import {
  clearHighlight,
  highlightElement,
  HIGHLIGHT_CLASS,
  resolveElementReference,
} from '../inspection/highlight';

const SEVERITY_STYLES: Record<
  DiagnosticSeverity,
  { color: string; bg: string; label: string }
> = {
  error: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/30',
    label: 'Error',
  },
  warning: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    label: 'Warning',
  },
  info: {
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    label: 'Info',
  },
};

const TYPE_LABELS: Record<string, string> = {
  'horizontal-overflow': 'Horizontal overflow',
  'off-viewport': 'Off-viewport',
  'text-overflow': 'Text overflow',
  'fixed-overlap': 'Fixed/sticky overlap',
  'touch-target': 'Touch target',
};

function severityIcon(severity: DiagnosticSeverity) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.color}`}
      aria-hidden="true"
    >
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        {severity === 'error' && (
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        )}
        {severity === 'warning' && (
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        )}
        {severity === 'info' && (
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        )}
      </svg>
    </span>
  );
}

function sourceLabel(ref: ElementReference): string {
  const parts: string[] = [];
  if (ref.tagName) parts.push(ref.tagName.toLowerCase());
  if (ref.id) parts.push(`#${ref.id}`);
  if (ref.className) {
    const cls = ref.className
      .split(/\s+/)
      .slice(0, 2)
      .filter(Boolean)
      .join('.');
    if (cls) parts.push(`.${cls}`);
  }
  return parts.join('');
}

interface DiagnosticItemProps {
  diagnostic: Diagnostic;
  /** The preview backend for this entry, used to resolve the highlight target. */
  backend: PreviewBackend | undefined;
  /** Currently highlighted diagnostic ID for this entry, if any. */
  highlightedId: string | null;
  /** Toggle highlight on/off for a diagnostic. */
  onToggleHighlight: (diagnosticId: string) => void;
}

export function DiagnosticItem({
  diagnostic,
  backend,
  highlightedId,
  onToggleHighlight,
}: DiagnosticItemProps) {
  const isHighlighted = highlightedId === diagnostic.id;
  const style = SEVERITY_STYLES[diagnostic.severity];
  const source = diagnostic.element ? sourceLabel(diagnostic.element) : '';
  const relatedSource = diagnostic.relatedElement
    ? sourceLabel(diagnostic.relatedElement)
    : '';

  const handleHighlight = useCallback(() => {
    if (!backend) return;
    const access = backend.getInspectionAccess();
    // Highlights are same-origin only — never fabricate access to pages the
    // backend reports as inaccessible.
    const doc = access?.status === 'available' ? access.document : null;
    if (isHighlighted) {
      // Clear this specific highlight
      clearHighlight(doc);
      onToggleHighlight('');
    } else {
      highlightElement(doc, diagnostic.element);
      // Dual highlight: also mark the related element (e.g. collision partner).
      try {
        const related = resolveElementReference(doc, diagnostic.relatedElement);
        related?.classList.add(HIGHLIGHT_CLASS);
      } catch {
        // Cross-origin or invalid ref — best-effort only.
      }
      onToggleHighlight(diagnostic.id);
    }
  }, [
    backend,
    diagnostic.id,
    diagnostic.element,
    diagnostic.relatedElement,
    isHighlighted,
    onToggleHighlight,
  ]);

  return (
    <li
      className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${
        isHighlighted
          ? 'bg-brand-50 dark:bg-brand-900/20'
          : 'bg-white dark:bg-gray-900'
      } hover:bg-gray-50 dark:hover:bg-gray-800`}
    >
      {severityIcon(diagnostic.severity)}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium ${style.color}`}
            aria-label={`Severity: ${style.label}`}
          >
            {TYPE_LABELS[diagnostic.type] ?? diagnostic.type}
          </span>
          {source && (
            <code className="truncate text-[11px] text-gray-500 dark:text-gray-400">
              {source}
            </code>
          )}
          {relatedSource && (
            <code className="shrink-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
              + {relatedSource}
            </code>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
          {diagnostic.message}
        </p>
      </div>
      {backend && (
        <button
          type="button"
          onClick={handleHighlight}
          className={`shrink-0 rounded p-1 text-xs transition-colors ${
            isHighlighted
              ? 'bg-brand-500 text-white'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
          }`}
          aria-label={
            isHighlighted ? 'Remove highlight' : 'Highlight element in preview'
          }
          aria-pressed={isHighlighted}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </button>
      )}
    </li>
  );
}
