import type { DeviceDefinition } from '../types';

const NO_SAFE_AREA = { top: 0, right: 0, bottom: 0, left: 0 } as const;

export const desktopPresets: readonly DeviceDefinition[] = [
  {
    id: 'desktop-720p',
    name: 'Desktop 1280 \u00d7 720',
    manufacturer: 'Generic',
    category: 'desktop',
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1,
    safeArea: NO_SAFE_AREA,
    orientations: ['landscape'],
  },
  {
    id: 'desktop-768p',
    name: 'Desktop 1366 \u00d7 768',
    manufacturer: 'Generic',
    category: 'desktop',
    viewport: { width: 1366, height: 768 },
    devicePixelRatio: 1,
    safeArea: NO_SAFE_AREA,
    orientations: ['landscape'],
  },
  {
    id: 'desktop-900p',
    name: 'Desktop 1440 \u00d7 900',
    manufacturer: 'Generic',
    category: 'desktop',
    viewport: { width: 1440, height: 900 },
    devicePixelRatio: 1,
    safeArea: NO_SAFE_AREA,
    orientations: ['landscape'],
  },
  {
    id: 'desktop-1080p',
    name: 'Desktop 1920 \u00d7 1080',
    manufacturer: 'Generic',
    category: 'desktop',
    viewport: { width: 1920, height: 1080 },
    devicePixelRatio: 1,
    safeArea: NO_SAFE_AREA,
    orientations: ['landscape'],
  },
];
