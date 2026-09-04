import type { RefObject } from 'react';
import type { SafeAreaInsets } from '@/devices';
import type { ComputedViewport } from '../types';
import { SafeAreaOverlay } from './SafeAreaOverlay';

interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  viewport: ComputedViewport;
  effectiveZoom: number;
  safeArea: SafeAreaInsets;
  deviceName: string;
}

/**
 * Wraps the preview iframe with a developer-tool bezel and safe-area overlay.
 *
 * Architecture:
 * - The container (ref) is sized to the device viewport dimensions so the
 *   Preview Engine's ResizeObserver receives stable measurements.
 * - The engine applies `transform: scale(effectiveZoom)` on the iframe.
 * - A visual wrapper is sized to the scaled footprint (viewport × effectiveZoom)
 *   so the parent flex centering and scroll behavior work correctly.
 * - CSS transforms do not participate in layout sizing, so the wrapper
 *   provides the correct layout footprint without introducing a second
 *   scale transform.
 *
 * The bezel is rendered as CSS box-shadow on the container, avoiding an
 * extra layout wrapper that would complicate the ResizeObserver integration.
 */
export function PreviewFrame({
  containerRef,
  viewport,
  effectiveZoom,
  safeArea,
  deviceName,
}: PreviewFrameProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Visual wrapper — sized to the scaled footprint for correct centering/scrolling */}
      <div
        style={{
          width: `${viewport.width * effectiveZoom}px`,
          height: `${viewport.height * effectiveZoom}px`,
        }}
      >
        {/* Container — sized to viewport dimensions for the engine's ResizeObserver */}
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl bg-white shadow-lg"
          style={{
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
            // Visual bezel: inner border + outer shadow for depth.
            // Does not affect layout dimensions.
            boxShadow: [
              'inset 0 0 0 3px #1f2937', // dark inner border (bezel)
              '0 4px 24px rgba(0, 0, 0, 0.25)', // drop shadow
            ].join(', '),
            // Engine-owned transform. No second scaling system is introduced.
            transform: `scale(${effectiveZoom})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Safe-area overlay — visual only, does not affect env() values.
              Uses raw viewport/safeArea values; the container's transform
              handles visual scaling. */}
          <SafeAreaOverlay safeArea={safeArea} viewport={viewport} />
        </div>
      </div>

      {/* Device name and viewport label — positioned outside the scaled container */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium">{deviceName}</span>
        <span>
          {viewport.width} × {viewport.height}
        </span>
      </div>
    </div>
  );
}
