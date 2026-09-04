import type { ComputedViewport } from '../types';

const DEFAULT_MAJOR_STEP = 100;
const DEFAULT_MINOR_STEP = 20;

const MAJOR_COLOR = 'rgba(100, 116, 139, 0.22)';
const MINOR_COLOR = 'rgba(100, 116, 139, 0.10)';

interface GridOverlayProps {
  /** The (orientation-resolved) viewport in CSS pixels. */
  viewport: ComputedViewport;
  /** Major grid spacing in CSS pixels. */
  majorStep?: number;
  /** Minor grid spacing in CSS pixels. */
  minorStep?: number;
}

/**
 * Viewport-only grid overlay.
 *
 * Rendered inside the scaled preview container, so it inherits the container's
 * `transform: scale(zoom)` and stays perfectly aligned with the iframe content
 * at any zoom. It is implemented with layered CSS gradients and absolutely NO
 * document mutation — it is a purely decorative host-side overlay covering only
 * the viewport area.
 *
 * Spacings are raw CSS pixels (like SafeAreaOverlay); the container transform
 * handles visual scaling, so the grid reads in document coordinates.
 */
export function GridOverlay({
  viewport,
  majorStep = DEFAULT_MAJOR_STEP,
  minorStep = DEFAULT_MINOR_STEP,
}: GridOverlayProps) {
  const { width, height } = viewport;
  if (width <= 0 || height <= 0) return null;
  if (majorStep <= 0 || minorStep <= 0) return null;

  return (
    <div
      data-testid="grid-overlay"
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        backgroundImage: [
          `linear-gradient(to right, ${MINOR_COLOR} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${MINOR_COLOR} 1px, transparent 1px)`,
          `linear-gradient(to right, ${MAJOR_COLOR} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${MAJOR_COLOR} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: [
          `${minorStep}px ${minorStep}px`,
          `${minorStep}px ${minorStep}px`,
          `${majorStep}px ${majorStep}px`,
          `${majorStep}px ${majorStep}px`,
        ].join(', '),
        backgroundPosition: '0 0, 0 0, 0 0, 0 0',
      }}
    />
  );
}
