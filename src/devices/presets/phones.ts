import type { DeviceDefinition } from '../types';

const BOTH_ORIENTATIONS = ['portrait', 'landscape'] as const;

/**
 * iPhone 15 family safe-area model (portrait): 59px top for the Dynamic
 * Island, 34px bottom for the home indicator, per Apple's HIG / WebKit
 * env(safe-area-inset-*) documentation. This is a portrait CSS layout model,
 * not a universal value for every browser or embedding context.
 */
const DYNAMIC_ISLAND_SAFE_AREA = {
  top: 59,
  right: 0,
  bottom: 34,
  left: 0,
} as const;

const NO_SAFE_AREA = { top: 0, right: 0, bottom: 0, left: 0 } as const;

export const phonePresets: readonly DeviceDefinition[] = [
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    manufacturer: 'Apple',
    category: 'phone',
    viewport: { width: 375, height: 667 },
    devicePixelRatio: 2,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'iphone-15',
    name: 'iPhone 15',
    manufacturer: 'Apple',
    category: 'phone',
    viewport: { width: 393, height: 852 },
    devicePixelRatio: 3,
    safeArea: DYNAMIC_ISLAND_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    manufacturer: 'Apple',
    category: 'phone',
    viewport: { width: 393, height: 852 },
    devicePixelRatio: 3,
    safeArea: DYNAMIC_ISLAND_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    manufacturer: 'Apple',
    category: 'phone',
    viewport: { width: 430, height: 932 },
    devicePixelRatio: 3,
    safeArea: DYNAMIC_ISLAND_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    // Android limitation: Chrome/Android env(safe-area-inset-*) values for the
    // camera cutout are not reliably published and typically report 0; zeros
    // here are a documented model, not authoritative physical measurements.
    id: 'samsung-galaxy-s24',
    name: 'Samsung Galaxy S24',
    manufacturer: 'Samsung',
    category: 'phone',
    viewport: { width: 360, height: 780 },
    devicePixelRatio: 3,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
  {
    id: 'google-pixel-8',
    name: 'Google Pixel 8',
    manufacturer: 'Google',
    category: 'phone',
    viewport: { width: 412, height: 915 },
    devicePixelRatio: 2.625,
    safeArea: NO_SAFE_AREA,
    orientations: BOTH_ORIENTATIONS,
  },
];
