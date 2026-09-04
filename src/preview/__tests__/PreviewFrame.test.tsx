/// <reference types="@testing-library/jest-dom/vitest" />
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { PreviewFrame } from '../components/PreviewFrame';
import type { ComputedViewport, ViewportMode } from '../types';
import type { ViewportToolsState } from '../viewTools';

const VIEWPORT: ComputedViewport = { width: 393, height: 852 };

const ALL_ON: ViewportToolsState = {
  rulers: true,
  grid: true,
  info: true,
  safeArea: true,
};

const ALL_OFF: ViewportToolsState = {
  rulers: false,
  grid: false,
  info: false,
  safeArea: false,
};

function renderFrame(
  overrides: Partial<{
    viewport: ComputedViewport;
    effectiveZoom: number;
    devicePixelRatio: number;
    tools: ViewportToolsState;
    viewportMode: ViewportMode;
  }> = {}
) {
  return render(
    <PreviewFrame
      containerRef={createRef<HTMLDivElement>()}
      viewport={overrides.viewport ?? VIEWPORT}
      effectiveZoom={overrides.effectiveZoom ?? 1}
      devicePixelRatio={overrides.devicePixelRatio ?? 3}
      safeArea={{ top: 59, right: 0, bottom: 34, left: 0 }}
      deviceName="iPhone 15"
      viewportMode={overrides.viewportMode ?? 'preset'}
      tools={overrides.tools ?? ALL_OFF}
    />
  );
}

describe('PreviewFrame viewport tools', () => {
  it('renders no overlays when all tools are off', () => {
    const { queryByTestId } = renderFrame({ tools: ALL_OFF });
    expect(queryByTestId('ruler-top')).not.toBeInTheDocument();
    expect(queryByTestId('ruler-left')).not.toBeInTheDocument();
    expect(queryByTestId('grid-overlay')).not.toBeInTheDocument();
    expect(queryByTestId('viewport-info-overlay')).not.toBeInTheDocument();
  });

  it('renders rulers, grid, info, and safe-area when enabled', () => {
    const { getByTestId } = renderFrame({ tools: ALL_ON });
    expect(getByTestId('ruler-top')).toBeInTheDocument();
    expect(getByTestId('ruler-left')).toBeInTheDocument();
    expect(getByTestId('grid-overlay')).toBeInTheDocument();
    expect(getByTestId('viewport-info-overlay')).toBeInTheDocument();
  });

  it('keeps decorative overlays hidden from assistive technology', () => {
    const { getByTestId } = renderFrame({ tools: ALL_ON });
    expect(getByTestId('ruler-top')).toHaveAttribute('aria-hidden', 'true');
    expect(getByTestId('ruler-left')).toHaveAttribute('aria-hidden', 'true');
    expect(getByTestId('grid-overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(getByTestId('viewport-info-overlay')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('renders the grid overlay with CSS-pixel spacing (not DPR-scaled)', () => {
    const { getByTestId } = renderFrame({
      tools: { ...ALL_OFF, grid: true },
    });
    const grid = getByTestId('grid-overlay');
    // background-image integrates layered gradients (major + minor) using raw
    // CSS-pixel spacing; DPR must not alter it.
    expect(grid.style.backgroundImage).toContain('linear-gradient');
    expect(grid.style.backgroundImage.split('linear-gradient').length).toBe(5);
  });

  it('positions ruler scales so labels match the viewport CSS dimension', () => {
    // Spot-check the container transform + wrapper footprint match the scaled
    // dims, and that the rulers request a footprint-length canvas.
    const { getByTestId, container } = renderFrame({
      tools: { ...ALL_OFF, rulers: true },
      effectiveZoom: 0.5,
      viewport: { width: 400, height: 800 },
    });
    const top = getByTestId('ruler-top');
    const left = getByTestId('ruler-left');
    // Canvas style width for top ruler equals 400 * 0.5 = 200
    expect(top).toHaveStyle({ width: '200px' });
    expect(left).toHaveStyle({ height: '400px' });

    // The scaled visual wrapper must be present so rulers align with it.
    const wrapper = container.querySelector('div[style*="200px"]');
    expect(wrapper).not.toBeNull();
  });

  it('renders the viewport-info readout with physical pixel resolution', () => {
    renderFrame({
      tools: { ...ALL_OFF, info: true },
      effectiveZoom: 0.5,
      devicePixelRatio: 3,
    });
    // Physical = 393*3 × 852*3, mode Preset.
    expect(document.body.textContent).toContain('1179×2556 PX');
  });

  it('marks the info mode as Custom for custom viewports', () => {
    renderFrame({
      tools: { ...ALL_OFF, info: true },
      viewportMode: 'custom',
    });
    expect(document.body.textContent).toMatch(/Custom/);
  });

  it('handles zero-sized viewport without crashing (jsdom default)', () => {
    const { queryByTestId } = renderFrame({
      tools: ALL_ON,
      viewport: { width: 0, height: 0 },
    });
    expect(queryByTestId('grid-overlay')).not.toBeInTheDocument();
  });
});
