import type { RefObject } from 'react';
import type { SafeAreaInsets } from '@/devices';
import type { ComputedViewport } from '../types';
import { SafeAreaOverlay } from './SafeAreaOverlay';

interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  viewport: ComputedViewport;
  zoom: number;
  safeArea: SafeAreaInsets;
  deviceName: string;
}

/**
 * Wraps the preview iframe with a developer-tool bezel and safe-area overlay.
 *
 * The container is sized to the device viewport dimensions so the Preview
 * Engine's ResizeObserver receives stable measurements. The iframe is
 * visually scaled via CSS transform: scale(zoom) — no second zoom system
 * is introduced.
 *
 * The bezel is rendered as CSS box-shadow on the container, avoiding an
 * extra layout wrapper that would complicate the ResizeObserver integration.
 */
export function PreviewFrame({
  containerRef,
  viewport,
  zoom,
  safeArea,
  deviceName,
}: PreviewFrameProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Container — sized to viewport dimensions for the engine */}
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
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Safe-area overlay — visual only, does not affect env() values */}
        <SafeAreaOverlay safeArea={safeArea} viewport={viewport} zoom={zoom} />
      </div>

      {/* Device name and viewport label — positioned outside the scaled container */}
      <div
        className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
        style={{
          width: `${viewport.width * zoom}px`,
        }}
      >
        <span className="font-medium">{deviceName}</span>
        <span>
          {viewport.width} × {viewport.height}
        </span>
      </div>
    </div>
  );
}
