# Device Registry

The Device Registry (`src/devices/`) is the single source of truth for all
device configurations supported by DeviceLab. Every feature that needs device
data (preview workspace, viewport controls, etc.) consumes it through this
registry instead of defining its own values.

## Viewport: CSS pixels, not physical pixels

`viewport.width` / `viewport.height` are the CSS-pixel dimensions a browser
reports, not the physical panel resolution. For example, an iPhone 15 has a
physical resolution of 1179 x 2556 but a CSS viewport of 393 x 852. Mobile
presets use the portrait base size.

## Device Pixel Ratio

`devicePixelRatio` maps CSS pixels to physical pixels (e.g. 3 means each CSS
pixel is a 3 x 3 block of physical pixels). Desktops use 1.

## Safe-area insets

`safeArea` holds CSS-pixel insets (top/right/bottom/left) in portrait
orientation, mirroring `env(safe-area-inset-*)`.

- **iPhone 15 family** uses 59/0/34/0: a portrait CSS layout model for the
  Dynamic Island (top) and home indicator (bottom), per Apple's Human Interface
  Guidelines and WebKit `env(safe-area-inset-*)` documentation. This is not a
  universal value for every browser or embedding context.
- **Android presets** (Galaxy S24, Pixel 8) use 0/0/0/0. Reliable published
  `env()` values for the camera cutout do not exist and Chrome/Android typically
  reports 0. These zeros are a documented model, not authoritative
  physical-device measurements.
- **iPads** and **desktops** use 0/0/0/0 (no reported insets).

## Adding a new preset

1. Add a `DeviceDefinition` to the appropriate file in `src/devices/presets/`
   (or create a new presets file and add it to the array in `registry.ts`).
2. Use a unique kebab-case `id`.
3. Run `npm run test` -- the registry tests validate the new entry.
