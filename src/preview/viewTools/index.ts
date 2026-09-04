/**
 * Viewport-tool types shared across the preview toolbar and overlays.
 *
 * Tool toggles are per-preview-instance UI state (held by PreviewInstance via
 * local useState) — they deliberately live outside the Zustand collection store
 * and outside the Preview Engine. This keeps engine state, collection state, and
 * viewport-tool UI state conceptually separate.
 */
export interface ViewportToolsState {
  /** Show CSS-pixel rulers around the scaled preview footprint. */
  rulers: boolean;
  /** Show a viewport-only, non-mutating grid overlay. */
  grid: boolean;
  /** Show a compact viewport-information readout near the frame. */
  info: boolean;
  /** Show the existing safe-area boundaries overlay. */
  safeArea: boolean;
}

/** Default state: rulers/grid/info off; safe-area stays visible as before. */
export const DEFAULT_VIEW_TOOLS: ViewportToolsState = {
  rulers: false,
  grid: false,
  info: false,
  safeArea: true,
};

export type ViewportToolKey = keyof ViewportToolsState;

export * from './rulers';
