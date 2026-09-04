import type { RefObject } from 'react';
import type { SafeAreaInsets } from '@/devices';
import type { ComputedViewport, ViewportMode } from '../types';
import type { ViewportToolsState } from '../viewTools';
import { computeRulerTicks } from '../viewTools';
import { GridOverlay } from './GridOverlay';
import { Ruler } from './Ruler';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { ViewportInfoOverlay } from './ViewportInfoOverlay';

interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  viewport: ComputedViewport;
  effectiveZoom: number;
  devicePixelRatio: number;
  safeArea: SafeAreaInsets;
  deviceName: string;
  viewportMode: ViewportMode;
  /** Per-instance viewport-tool toggles. */
  tools: ViewportToolsState;
}

/**
 * Wraps the preview iframe with a developer-tool bezel, safe-area overlay, and
 * (optionally) CSS-pixel rulers, a viewport-only grid, and a viewport-info
 * readout.
 *
 * Architecture:
 * - The container (ref) is sized to the device viewport dimensions so the
 *   Preview Engine's ResizeObserver receives stable measurements.
 * - The engine applies `transform: scale(effectiveZoom)` on the iframe.
 * - A visual wrapper is sized to the scaled footprint (viewport × effectiveZoom)
 *   so the parent flex centering and scroll behavior work correctly.
 * - Grid + safe-area overlays are children of the scaled container, so they
 *   inherit the zoom transform and stay aligned with the iframe content.
 * - Rulers are in-flow siblings aligned to the scaled footprint edges, labeled
 *   in CSS pixels so zoom/DPR never change their meaning.
 * - The info readout renders with the device label, outside the scaled area,
 *   so its text stays crisp.
 */
export function PreviewFrame({
  containerRef,
  viewport,
  effectiveZoom,
  devicePixelRatio,
  safeArea,
  deviceName,
  viewportMode,
  tools,
}: PreviewFrameProps) {
  const scaledW = viewport.width * effectiveZoom;
  const scaledH = viewport.height * effectiveZoom;
  const rulerTicksTop = computeRulerTicks(viewport.width, effectiveZoom);
  const rulerTicksLeft = computeRulerTicks(viewport.height, effectiveZoom);

  return (
    <div className="flex flex-col items-center">
      {/* Optional top ruler — an in-flow sibling above the frame so it is never
          clipped by layout-mode overflow containers. */}
      {tools.rulers && (
        <Ruler
          axis="top"
          length={scaledW}
          dpr={devicePixelRatio}
          ticks={rulerTicksTop}
        />
      )}

      {/* Row: optional left ruler aligned with the frame's scaled footprint. */}
      <div className="flex">
        {tools.rulers && (
          <Ruler
            axis="left"
            length={scaledH}
            dpr={devicePixelRatio}
            ticks={rulerTicksLeft}
          />
        )}

        {/* Visual wrapper — sized to the scaled footprint for correct centering/scrolling */}
        <div
          style={{
            width: `${scaledW}px`,
            height: `${scaledH}px`,
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
            {/* Viewport-only grid overlay — visual only, zooms with the container. */}
            {tools.grid && <GridOverlay viewport={viewport} />}

            {/* Safe-area overlay — visual only, does not affect env() values.
                Uses raw viewport/safeArea values; the container's transform
                handles visual scaling. */}
            {tools.safeArea && (
              <SafeAreaOverlay safeArea={safeArea} viewport={viewport} />
            )}
          </div>
        </div>
      </div>

      {/* Device name, viewport label, and optional info readout — positioned
          outside the scaled container */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium">{deviceName}</span>
        <span>
          {viewport.width} × {viewport.height}
        </span>
        {tools.info && (
          <ViewportInfoOverlay
            viewport={viewport}
            devicePixelRatio={devicePixelRatio}
            effectiveZoom={effectiveZoom}
            mode={viewportMode}
          />
        )}
      </div>
    </div>
  );
}
