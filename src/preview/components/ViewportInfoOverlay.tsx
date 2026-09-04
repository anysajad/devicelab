import type { ComputedViewport } from '../types';

interface ViewportInfoOverlayProps {
  /** The orientation-resolved viewport in CSS pixels. */
  viewport: ComputedViewport;
  /** The device pixel ratio (used to compute physical pixel resolution). */
  devicePixelRatio: number;
  /** Current effective zoom as a fraction (e.g. 0.67 → "67%"). */
  effectiveZoom: number;
  /** Viewport mode label, e.g. "Preset" or "Custom". */
  mode: 'preset' | 'custom';
}

/**
 * Compact, content-anchored viewport-information readout rendered near the
 * preview frame. It surfaces data that is NOT already clearly available in the
 * toolbar badge (which shows CSS W×H and the DPR multiplier): the physical
 * pixel resolution and the viewport mode.
 *
 * The visible text is decorative-safe: a screen-reader-visible equivalent is
 * provided via visually-hidden text so the overlay itself never announces.
 */
export function ViewportInfoOverlay({
  viewport,
  devicePixelRatio,
  effectiveZoom,
  mode,
}: ViewportInfoOverlayProps) {
  const cssW = viewport.width;
  const cssH = viewport.height;
  const physW = Math.round(cssW * devicePixelRatio);
  const physH = Math.round(cssH * devicePixelRatio);
  const zoomPercent = Math.round(effectiveZoom * 100);
  const modeLabel = mode === 'custom' ? 'Custom' : 'Preset';

  return (
    <div
      data-testid="viewport-info-overlay"
      className="pointer-events-none rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-[11px] leading-tight text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300"
      aria-hidden="true"
    >
      <span className="font-medium text-gray-800 dark:text-gray-100">
        {modeLabel}
      </span>
      <span className="tabular-nums">
        {' '}
        · {cssW}×{cssH} CSS · {physW}×{physH} PX @ {zoomPercent}% · DPR{' '}
        {devicePixelRatio}×
      </span>
    </div>
  );
}
