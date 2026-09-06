/**
 * Coordinate conversion tests.
 *
 * Tests the mapping between multiple coordinate spaces:
 * - Browser viewport CSS pixels (Playwright page coordinates)
 * - Canvas internal pixel coordinates
 * - Canvas displayed CSS dimensions
 * - Pointer event client coordinates
 */

import { describe, it, expect } from 'vitest';
import {
  clientToViewport,
  isWithinViewport,
  clampToViewport,
} from '../coordinateConversion';
import type { CoordinateConversionConfig } from '../coordinateConversion';

describe('Coordinate Conversion', () => {
  describe('clientToViewport', () => {
    // Test case: 375×667 canvas displayed at 375×667 (1:1 scale)
    it('converts 1:1 scale correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 375,
        viewportHeight: 667,
        canvasWidth: 375,
        canvasHeight: 667,
        displayedWidth: 375,
        displayedHeight: 667,
      };

      const result = clientToViewport(100, 200, config);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
      expect(result.inBounds).toBe(true);
    });

    // Test case: 375×667 canvas displayed at 187.5×333.5 (0.5x scale)
    it('converts 0.5x scale correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 375,
        viewportHeight: 667,
        canvasWidth: 375,
        canvasHeight: 667,
        displayedWidth: 187.5,
        displayedHeight: 333.5,
      };

      // Click at displayed (100, 200) should map to viewport (200, 400)
      const result = clientToViewport(100, 200, config);
      expect(result.x).toBe(200);
      expect(result.y).toBe(400);
      expect(result.inBounds).toBe(true);
    });

    // Test case: 375×667 canvas displayed at 750×1334 (2x scale)
    it('converts 2x scale correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 375,
        viewportHeight: 667,
        canvasWidth: 375,
        canvasHeight: 667,
        displayedWidth: 750,
        displayedHeight: 1334,
      };

      // Click at displayed (200, 400) should map to viewport (100, 200)
      const result = clientToViewport(200, 400, config);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
      expect(result.inBounds).toBe(true);
    });

    // Test case: edges
    it('handles edge coordinates correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 375,
        viewportHeight: 667,
        canvasWidth: 375,
        canvasHeight: 667,
        displayedWidth: 375,
        displayedHeight: 667,
      };

      // Top-left corner
      const topLeft = clientToViewport(0, 0, config);
      expect(topLeft.x).toBe(0);
      expect(topLeft.y).toBe(0);
      expect(topLeft.inBounds).toBe(true);

      // Bottom-right corner
      const bottomRight = clientToViewport(375, 667, config);
      expect(bottomRight.x).toBe(375);
      expect(bottomRight.y).toBe(667);
      expect(bottomRight.inBounds).toBe(true);

      // Slightly outside
      const outside = clientToViewport(376, 668, config);
      expect(outside.inBounds).toBe(false);
    });

    // Test case: landscape viewport
    it('handles landscape viewport correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 667,
        viewportHeight: 375,
        canvasWidth: 667,
        canvasHeight: 375,
        displayedWidth: 667,
        displayedHeight: 375,
      };

      const result = clientToViewport(333, 187, config);
      expect(result.x).toBe(333);
      expect(result.y).toBe(187);
      expect(result.inBounds).toBe(true);
    });

    // Test case: custom viewport
    it('handles custom viewport correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 1024,
        viewportHeight: 768,
        canvasWidth: 1024,
        canvasHeight: 768,
        displayedWidth: 512,
        displayedHeight: 384,
      };

      // Click at displayed (256, 192) should map to viewport (512, 384)
      const result = clientToViewport(256, 192, config);
      expect(result.x).toBe(512);
      expect(result.y).toBe(384);
      expect(result.inBounds).toBe(true);
    });

    // Test case: non-integer displayed dimensions
    it('handles non-integer displayed dimensions correctly', () => {
      const config: CoordinateConversionConfig = {
        viewportWidth: 375,
        viewportHeight: 667,
        canvasWidth: 375,
        canvasHeight: 667,
        displayedWidth: 333.333,
        displayedHeight: 591.111,
      };

      const result = clientToViewport(100, 200, config);
      // 100 * (375 / 333.333) = 112.5
      // 200 * (667 / 591.111) = 225.677...
      expect(result.x).toBeCloseTo(112.5, 1);
      expect(result.y).toBeCloseTo(225.68, 0);
      expect(result.inBounds).toBe(true);
    });
  });

  describe('isWithinViewport', () => {
    it('returns true for points inside viewport', () => {
      expect(isWithinViewport(0, 0, 375, 667)).toBe(true);
      expect(isWithinViewport(375, 667, 375, 667)).toBe(true);
      expect(isWithinViewport(187, 333, 375, 667)).toBe(true);
    });

    it('returns false for points outside viewport', () => {
      expect(isWithinViewport(-1, 0, 375, 667)).toBe(false);
      expect(isWithinViewport(0, -1, 375, 667)).toBe(false);
      expect(isWithinViewport(376, 0, 375, 667)).toBe(false);
      expect(isWithinViewport(0, 668, 375, 667)).toBe(false);
    });
  });

  describe('clampToViewport', () => {
    it('clamps coordinates to viewport bounds', () => {
      expect(clampToViewport(-10, -20, 375, 667)).toEqual({ x: 0, y: 0 });
      expect(clampToViewport(400, 700, 375, 667)).toEqual({ x: 375, y: 667 });
      expect(clampToViewport(100, 200, 375, 667)).toEqual({ x: 100, y: 200 });
    });
  });
});
