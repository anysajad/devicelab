export type {
  DeviceCategory,
  DeviceDefinition,
  DeviceOrientation,
  DeviceViewport,
  SafeAreaInsets,
} from './types';
export {
  getAllDevices,
  getDeviceById,
  getDevicesByCategory,
  supportsOrientation,
} from './registry';
