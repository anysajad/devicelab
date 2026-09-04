import { useEffect, useRef } from 'react';

import type { RulerTick, RulerTicks } from '../viewTools';

const RULER_THICKNESS = 22;

interface RulerProps {
  /** 'top' renders ticks downward from a horizontal strip; 'left' renders to the right of a vertical strip. */
  axis: 'top' | 'left';
  /** On-screen length of the ruler in CSS px (the scaled viewport dimension). */
  length: number;
  /** Device pixel ratio used only to rasterize the canvas at native resolution. */
  dpr: number;
  /** Major + minor tick arrays (computed in screen px, labeled in CSS px). */
  ticks: RulerTicks;
  /** Optional CSS color for the tick/label stroke. */
  color?: string;
}

function formatCssValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * A CSS-pixel ruler drawn as a sibling of the scaled preview container.
 *
 * The canvas CSS size equals the scaled footprint so its 0 tick aligns exactly
 * with the iframe's edge at any zoom. Ticks are placed at `cssValue * zoom`
 * screen pixels but labeled with their CSS-pixel value, keeping measurements
 * independent of zoom and devicePixelRatio.
 */
export function Ruler({
  axis,
  length,
  dpr,
  ticks,
  color = 'rgba(100, 116, 139, 0.8)',
}: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isTop = axis === 'top';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pixelRatio = Math.max(dpr, 1);
    if (isTop) {
      canvas.width = Math.max(Math.round(length * pixelRatio), 1);
      canvas.height = RULER_THICKNESS * pixelRatio;
      canvas.style.width = `${length}px`;
      canvas.style.height = `${RULER_THICKNESS}px`;
    } else {
      canvas.width = RULER_THICKNESS * pixelRatio;
      canvas.height = Math.max(Math.round(length * pixelRatio), 1);
      canvas.style.width = `${RULER_THICKNESS}px`;
      canvas.style.height = `${length}px`;
    }
    canvas.getContext('2d')?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, length, isTop ? RULER_THICKNESS : length);

    const majorLen = isTop ? Math.round(RULER_THICKNESS * 0.6) : 8;
    const minorLen = isTop ? Math.round(RULER_THICKNESS * 0.35) : 5;
    drawTicks(ctx, ticks.major, majorLen, true);
    drawTicks(ctx, ticks.minor, minorLen, false);

    function drawTicks(
      canvasCtx: CanvasRenderingContext2D,
      tickList: readonly RulerTick[],
      tickLen: number,
      isMajor: boolean
    ) {
      const labelMargin = isTop ? 3 : majorLen + 4;
      canvasCtx.strokeStyle = isMajor ? color : `${color}55`;
      canvasCtx.fillStyle = color;
      canvasCtx.font = '9px system-ui, sans-serif';
      canvasCtx.textBaseline = 'top';
      for (const tick of tickList) {
        const pos = tick.screenPos;
        canvasCtx.beginPath();
        if (isTop) {
          canvasCtx.moveTo(pos + 0.5, 0);
          canvasCtx.lineTo(pos + 0.5, tickLen);
          if (isMajor) {
            canvasCtx.fillText(
              formatCssValue(tick.cssValue),
              pos + 2,
              labelMargin
            );
          }
        } else {
          canvasCtx.moveTo(0, pos + 0.5);
          canvasCtx.lineTo(tickLen, pos + 0.5);
          if (isMajor) {
            canvasCtx.textBaseline = 'middle';
            canvasCtx.fillText(
              formatCssValue(tick.cssValue),
              labelMargin,
              pos - 1
            );
          }
        }
        canvasCtx.stroke();
      }
    }
  }, [axis, length, dpr, ticks, color, isTop]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={`ruler-${axis}`}
      className="pointer-events-none"
      aria-hidden="true"
    />
  );
}
