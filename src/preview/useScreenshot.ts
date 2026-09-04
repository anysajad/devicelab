import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PreviewController } from './types';
import { createScreenshotCapturer } from '../screenshot';
import type { ScreenshotStatus } from '../screenshot';

export interface UseScreenshotReturn {
  /** Trigger a capture + download for this instance. */
  capture: () => Promise<void>;
  /** Latest capture status (or null before any attempt). */
  status: ScreenshotStatus | null;
  /** True while a capture is in flight. */
  isBusy: boolean;
}

/**
 * Wire a PreviewController into the screenshot subsystem.
 *
 * Reads ONLY `controller.getIframe()` and `controller.getState()` — it never
 * mutates the controller, zoom, viewport, or inspection state.
 *
 * On success, downloads the produced PNG via a temporary anchor and revokes the
 * object URL. On unsupported/errors, the status is surfaced for the UI; no
 * misleading PNG is produced.
 */
export function useScreenshot(
  controller: PreviewController
): UseScreenshotReturn {
  const [status, setStatus] = useState<ScreenshotStatus | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const capturer = useMemo(() => createScreenshotCapturer(), []);
  const lastUrlRef = useRef<string | null>(null);

  const revokeUrl = useCallback((url: string | null) => {
    if (!url) return;
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // best-effort cleanup
    }
  }, []);

  const downloadBlob = useCallback(
    (url: string, filename: string) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoke the previous URL once the anchor has had a chance to start.
      revokeUrl(lastUrlRef.current);
      lastUrlRef.current = url;
    },
    [revokeUrl]
  );

  const capture = useCallback(async (): Promise<void> => {
    if (isBusy) return;
    setIsBusy(true);

    try {
      const state = controller.getState();
      const iframe = controller.getIframe();
      const spec = {
        width: state.viewport.width,
        height: state.viewport.height,
      };

      const result = await capturer.capture(
        { iframe, deviceName: state.config.device.name ?? 'preview' },
        spec
      );

      if (result.status === 'ok') {
        downloadBlob(result.url, result.filename);
        setStatus('ok');
      } else {
        setStatus(result.status);
      }
    } catch {
      setStatus('render-failed');
    } finally {
      setIsBusy(false);
    }
  }, [capturer, controller, isBusy, downloadBlob]);

  // Revoke the last object URL on unmount.
  useEffect(() => {
    return () => revokeUrl(lastUrlRef.current);
  }, [revokeUrl]);

  return { capture, status, isBusy };
}
