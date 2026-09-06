import { useCallback, useEffect, useId, useRef } from 'react';

interface ConfirmDialogProps {
  /** Title of the dialog. */
  title: string;
  /** Message body. */
  message: string;
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Label for the cancel button. */
  cancelLabel?: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** Optional: whether the confirm action is destructive (red styling). */
  destructive?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], select, textarea, input, [tabindex]:not([tabindex="-1"])';

/**
 * Minimal accessible confirmation dialog.
 *
 * Renders a modal overlay with a focus trap, Escape key support, click-outside
 * to cancel, and restores focus to the previously focused element on close.
 * No new dependencies.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Remember what had focus before the dialog opened, and focus the cancel
  // button for safety on mount.
  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
  }, []);

  // Restore focus to the previously focused element on unmount (close).
  useEffect(() => {
    return () => {
      restoreFocusRef.current?.focus();
    };
  }, []);

  // Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Focus trap: keep focus cycling inside the dialog while it is open.
  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
        className="mx-4 max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      >
        <h2
          id={titleId}
          className="text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-brand-500 hover:bg-brand-600 focus:ring-brand-500'
            } focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
