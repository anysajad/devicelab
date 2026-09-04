import type { ScreenshotStatus } from '../../screenshot';

interface ScreenshotButtonProps {
  /** Whether a device is loaded (button disabled when false). */
  hasDevice: boolean;
  /** True while a capture is in flight. */
  isBusy: boolean;
  /** Latest capture status for the status label. */
  status: ScreenshotStatus | null;
  /** Trigger the capture. */
  onCapture: () => void;
}

function statusLabel(status: ScreenshotStatus | null): string | null {
  switch (status) {
    case 'ok':
      return 'Captured';
    case 'cross-origin':
      return 'Unavailable (cross-origin)';
    case 'not-ready':
      return 'Preview not ready';
    case 'render-failed':
      return 'Capture failed';
    default:
      return null;
  }
}

/**
 * Per-instance screenshot trigger shown in the preview toolbar.
 *
 * The button reflects the last capture status so unsupported cases
 * (cross-origin, not-ready, render-failed) are surfaced visibly and honestly
 * rather than producing a misleading image.
 */
export function ScreenshotButton({
  hasDevice,
  isBusy,
  status,
  onCapture,
}: ScreenshotButtonProps) {
  const label = statusLabel(status);
  const isError =
    status === 'cross-origin' ||
    status === 'render-failed' ||
    status === 'not-ready';

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCapture}
        disabled={!hasDevice || isBusy}
        aria-label="Capture screenshot"
        aria-busy={isBusy}
        title="Capture a PNG screenshot of the preview viewport"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {isBusy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.75 1.75 0 0022 19.25V5.75A1.75 1.75 0 0020.25 4H3.75A1.75 1.75 0 002 5.75v13.5A1.75 1.75 0 003.75 21zM15.75 9.75a1.125 1.125 0 110-2.25 1.125 1.125 0 010 2.25z"
            />
          </svg>
        )}
      </button>
      {label && (
        <span
          className={`text-xs ${
            isError
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
          role="status"
          aria-live="polite"
        >
          {label}
        </span>
      )}
    </div>
  );
}
