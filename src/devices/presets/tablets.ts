import type { DeviceDefinition } from '../types';

const BOTH_ORIENTATIONS = ['portrait', 'landscape'] as const;

/** iPadOS reports no env(safe-area-inset-*) insets for current iPads. */
const NO_SAFE_AREA = { top: 0, right: 0, bottom: 0, left: 0 } as const;

export const tabletPresets: readonly DeviceDefinition[] = [
  {
    id: 'ipad',
    name: 'iPad',
    manufacturer: 'Apple',
    category: 'tablet',
    viewport: { width: 820, height: 1180 },
    devicePixelRatio: 2,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'ipad-air',
    name: 'iPad Air',
    manufacturer: 'Apple',
    category: 'tablet',
    viewport: { width: 820, height: 1180 },
    devicePixelRatio: 2,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'ipad-pro-11',
    name: 'iPad Pro 11\u2032',
    manufacturer: 'Apple',
    category: 'tablet',
    viewport: { width: 834, height: 1194 },
    devicePixelRatio: 2,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
];
