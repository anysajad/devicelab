import { useCallback } from 'react';

interface NoticeProps {
  /** The message to display. */
  message: string;
  /** Whether the notice is an error. */
  variant?: 'error' | 'info';
  /** Called when the user dismisses the notice. */
  onDismiss: () => void;
}

/**
 * Inline role="alert" notice for surfacing errors or status.
 * Renders as a banner above the workspace content.
 */
export function Notice({ message, variant = 'error', onDismiss }: NoticeProps) {
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const styles =
    variant === 'error'
      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-center justify-between border-b px-4 py-2 text-sm ${styles}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-3 text-current opacity-70 hover:opacity-100"
        aria-label="Dismiss"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
