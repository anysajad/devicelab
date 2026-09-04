export type DeviceCategory = 'phone' | 'tablet' | 'desktop' | 'custom';

export type DeviceOrientation = 'portrait' | 'landscape';

/** CSS-pixel viewport dimensions (portrait base for mobile devices). */
export interface DeviceViewport {
  readonly width: number;
  readonly height: number;
}

/** CSS-pixel safe-area insets, portrait orientation. */
export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface DeviceDefinition {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly category: DeviceCategory;
  readonly viewport: DeviceViewport;
  readonly devicePixelRatio: number;
  readonly safeArea: SafeAreaInsets;
  readonly orientations: readonly DeviceOrientation[];
}
