/**
 * Tests for BrowserPreviewSurface canvas component.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createBrowserPreviewSurface,
  type BrowserPreviewSurface,
} from '../browserPreviewSurface';

describe('BrowserPreviewSurface', () => {
  let container: HTMLDivElement;
  let surface: BrowserPreviewSurface;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    surface?.destroy();
    container?.remove();
  });

  it('creates a canvas element', () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    const canvas = surface.getCanvas();
    expect(canvas).toBeDefined();
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.width).toBe(375);
    expect(canvas.height).toBe(667);
  });

  it('mounts canvas into container', () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    expect(container.children.length).toBe(1);
    expect(container.children[0]?.tagName).toBe('CANVAS');
  });

  it('resizes canvas', () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    surface.resize(1024, 768);

    const canvas = surface.getCanvas();
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });

  it('cleans up on destroy', () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    expect(container.children.length).toBe(1);

    surface.destroy();

    expect(container.children.length).toBe(0);
  });

  it('does not throw on double destroy', () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    surface.destroy();
    expect(() => surface.destroy()).not.toThrow();
  });

  it('does not draw after destroy', async () => {
    surface = createBrowserPreviewSurface({
      container,
      width: 375,
      height: 667,
    });

    surface.destroy();

    // Should not throw
    await expect(
      surface.drawFrame('base64data', 375, 667)
    ).resolves.toBeUndefined();
  });
});
