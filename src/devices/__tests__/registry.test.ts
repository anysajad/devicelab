import { describe, expect, it } from 'vitest';

import {
  getAllDevices,
  getDeviceById,
  getDevicesByCategory,
  supportsOrientation,
} from '../registry';
import type { DeviceCategory } from '../types';

const VALID_CATEGORIES: readonly DeviceCategory[] = [
  'phone',
  'tablet',
  'desktop',
  'custom',
];

const EXPECTED_IDS = [
  'iphone-se',
  'iphone-15',
  'iphone-15-pro',
  'iphone-15-pro-max',
  'samsung-galaxy-s24',
  'google-pixel-8',
  'ipad',
  'ipad-air',
  'ipad-pro-11',
  'desktop-720p',
  'desktop-768p',
  'desktop-900p',
  'desktop-1080p',
];

describe('device registry', () => {
  it('has unique device IDs', () => {
    const ids = getAllDevices().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every device has a valid viewport width and height', () => {
    for (const d of getAllDevices()) {
      expect(Number.isFinite(d.viewport.width)).toBe(true);
      expect(Number.isFinite(d.viewport.height)).toBe(true);
      expect(d.viewport.width).toBeGreaterThan(0);
      expect(d.viewport.height).toBeGreaterThan(0);
    }
  });

  it('every device has a valid category', () => {
    for (const d of getAllDevices()) {
      expect(VALID_CATEGORIES).toContain(d.category);
    }
  });

  it('every device has a valid DPR', () => {
    for (const d of getAllDevices()) {
      expect(Number.isFinite(d.devicePixelRatio)).toBe(true);
      expect(d.devicePixelRatio).toBeGreaterThan(0);
    }
  });

  it('safe-area values are non-negative', () => {
    for (const d of getAllDevices()) {
      expect(d.safeArea.top).toBeGreaterThanOrEqual(0);
      expect(d.safeArea.right).toBeGreaterThanOrEqual(0);
      expect(d.safeArea.bottom).toBeGreaterThanOrEqual(0);
      expect(d.safeArea.left).toBeGreaterThanOrEqual(0);
    }
  });

  it('every device supports at least one orientation', () => {
    for (const d of getAllDevices()) {
      expect(d.orientations.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getDeviceById() returns the device for a known ID', () => {
    const device = getDeviceById('iphone-15');
    expect(device).toBeDefined();
    expect(device?.name).toBe('iPhone 15');
  });

  it('getDeviceById() returns undefined for an unknown ID', () => {
    expect(getDeviceById('does-not-exist')).toBeUndefined();
  });

  it('category filtering works', () => {
    const phones = getDevicesByCategory('phone');
    expect(phones).toHaveLength(6);
    expect(phones.every((d) => d.category === 'phone')).toBe(true);
    expect(getDevicesByCategory('tablet')).toHaveLength(3);
    expect(getDevicesByCategory('desktop')).toHaveLength(4);
    expect(getDevicesByCategory('custom')).toHaveLength(0);
  });

  it('orientation support checking works', () => {
    const iphone = getDeviceById('iphone-15');
    const desktop = getDeviceById('desktop-1080p');
    expect(iphone && supportsOrientation(iphone, 'portrait')).toBe(true);
    expect(iphone && supportsOrientation(iphone, 'landscape')).toBe(true);
    expect(desktop && supportsOrientation(desktop, 'landscape')).toBe(true);
    expect(desktop && supportsOrientation(desktop, 'portrait')).toBe(false);
  });

  it('all intended presets are present', () => {
    const ids = getAllDevices().map((d) => d.id);
    for (const id of EXPECTED_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(EXPECTED_IDS.length);
  });
});
