import type { SafeAreaInsets, DeviceViewport } from '@/devices';

interface SafeAreaOverlayProps {
  safeArea: SafeAreaInsets;
  viewport: DeviceViewport;
  zoom: number;
}

/**
 * Visual-only overlay showing safe-area boundaries.
 *
 * This component renders colored semi-transparent bars at the positions
 * where a real device would have safe-area insets. It is a VISUAL
 * REPRESENTATION ONLY and does NOT inject CSS env() values into the
 * iframe or otherwise affect the target application's layout.
 */
export function SafeAreaOverlay({
  safeArea,
  viewport,
  zoom,
}: SafeAreaOverlayProps) {
  const hasInsets =
    safeArea.top > 0 ||
    safeArea.right > 0 ||
    safeArea.bottom > 0 ||
    safeArea.left > 0;

  if (!hasInsets) {
    return null;
  }

  const color = 'rgba(12, 147, 231, 0.12)'; // brand-500 at 12% opacity
  const labelColor = 'rgba(12, 147, 231, 0.7)';

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top safe area */}
      {safeArea.top > 0 && (
        <div
          className="absolute top-0 left-0 flex items-center justify-center"
          style={{
            width: `${viewport.width}px`,
            height: `${safeArea.top * zoom}px`,
            backgroundColor: color,
          }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: labelColor }}
          >
            {safeArea.top}px
          </span>
        </div>
      )}

      {/* Bottom safe area */}
      {safeArea.bottom > 0 && (
        <div
          className="absolute bottom-0 left-0 flex items-center justify-center"
          style={{
            width: `${viewport.width}px`,
            height: `${safeArea.bottom * zoom}px`,
            backgroundColor: color,
          }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: labelColor }}
          >
            {safeArea.bottom}px
          </span>
        </div>
      )}

      {/* Left safe area */}
      {safeArea.left > 0 && (
        <div
          className="absolute top-0 left-0 flex items-center justify-center"
          style={{
            width: `${safeArea.left * zoom}px`,
            height: `${viewport.height}px`,
            backgroundColor: color,
          }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: labelColor }}
          >
            {safeArea.left}px
          </span>
        </div>
      )}

      {/* Right safe area */}
      {safeArea.right > 0 && (
        <div
          className="absolute top-0 right-0 flex items-center justify-center"
          style={{
            width: `${safeArea.right * zoom}px`,
            height: `${viewport.height}px`,
            backgroundColor: color,
          }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: labelColor }}
          >
            {safeArea.right}px
          </span>
        </div>
      )}
    </div>
  );
}
