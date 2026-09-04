import { desktopPresets } from './presets/desktops';
import { phonePresets } from './presets/phones';
import { tabletPresets } from './presets/tablets';
import type {
  DeviceCategory,
  DeviceDefinition,
  DeviceOrientation,
} from './types';

/** Single source of truth for supported device presets. Immutable. */
const DEVICES: readonly DeviceDefinition[] = Object.freeze([
  ...phonePresets,
  ...tabletPresets,
  ...desktopPresets,
]);

export function getAllDevices(): readonly DeviceDefinition[] {
  return DEVICES;
}

/** Returns undefined for unknown IDs. */
export function getDeviceById(id: string): DeviceDefinition | undefined {
  return DEVICES.find((device) => device.id === id);
}

export function getDevicesByCategory(
  category: DeviceCategory
): readonly DeviceDefinition[] {
  return DEVICES.filter((device) => device.category === category);
}

export function supportsOrientation(
  device: DeviceDefinition,
  orientation: DeviceOrientation
): boolean {
  return device.orientations.includes(orientation);
}
