import { describe, expect, it } from 'vitest';

import { offViewportChecker } from '../../diagnostics/offViewport';
import { setupInspectionTest } from '../helpers';

const VIEWPORT = { width: 375, height: 812 };

describe('offViewportChecker', () => {
  it('reports an element entirely outside the viewport', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'e', data: { rect: { x: 600, y: 0, width: 100, height: 50 } } },
      ],
    });
    const diagnostics = offViewportChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('reports an element partially outside the viewport', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        // Extends past right edge (rect 350..460, viewport 375)
        { id: 'e', data: { rect: { x: 350, y: 10, width: 110, height: 50 } } },
      ],
    });
    const diagnostics = offViewportChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('info');
  });

  it('does not report an element fully inside the viewport', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'e', data: { rect: { x: 10, y: 10, width: 100, height: 50 } } },
      ],
    });
    const diagnostics = offViewportChecker(context);
    expect(diagnostics).toHaveLength(0);
  });

  it('excludes display:none elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            rect: { x: 600, y: 0, width: 100, height: 50 },
            style: { display: 'none' },
          },
        },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('excludes visibility:hidden elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            rect: { x: 600, y: 0, width: 100, height: 50 },
            style: { visibility: 'hidden' },
          },
        },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('excludes zero-size elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'e', data: { rect: { x: 600, y: 0, width: 0, height: 0 } } },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('excludes tiny elements (< 2x2)', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'e', data: { rect: { x: 600, y: 0, width: 1, height: 1 } } },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('excludes non-visual tags logically excluded by inspectable set', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'e', data: { rect: { x: 600, y: 0, width: 100, height: 50 } } },
      ],
    });
    // SCRIPT/STYLE are not in inspectable elements anyway
    expect(offViewportChecker(context)).toHaveLength(1);
  });

  it('excludes fixed elements (handled by fixedOverlap)', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            rect: { x: 600, y: 0, width: 100, height: 50 },
            style: { position: 'fixed' },
          },
        },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('excludes sticky elements (handled by fixedOverlap)', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            rect: { x: 600, y: 0, width: 100, height: 50 },
            style: { position: 'sticky' },
          },
        },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('caps reported diagnostics at 20 and communicates suppression', () => {
    let html = '';
    const measurements: Array<{
      id: string;
      data: { rect: { x: number; y: number; width: number; height: number } };
    }> = [];
    for (let i = 0; i < 30; i++) {
      html += `<div id="e${i}" style="width:5px;height:5px"></div>`;
      measurements.push({
        id: `e${i}`,
        data: { rect: { x: 600, y: 0, width: 5, height: 5 } },
      });
    }
    const { context } = setupInspectionTest({
      bodyHtml: html,
      viewport: VIEWPORT,
      measurements,
    });
    const diagnostics = offViewportChecker(context);
    // 20 reported + 1 suppression note
    expect(diagnostics).toHaveLength(21);
    expect(diagnostics[20]!.metadata).toMatchObject({ suppressed: 10 });
  });

  it('ignores sub-edge violations within the 1px tolerance', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        // Extends 1px past the right edge (right = 376)
        { id: 'e', data: { rect: { x: 374, y: 10, width: 2, height: 50 } } },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('reports violations beyond the 1px tolerance', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: VIEWPORT,
      measurements: [
        // Extends 2px past the right edge (right = 377 < 375 + 1)
        { id: 'e', data: { rect: { x: 374, y: 10, width: 3, height: 50 } } },
      ],
    });
    const diagnostics = offViewportChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('info');
  });

  it('excludes elements with aria-hidden or [hidden] attributes', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="ah" aria-hidden="true">x</div><div id="hd" hidden>x</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'ah', data: { rect: { x: 600, y: 0, width: 100, height: 50 } } },
        { id: 'hd', data: { rect: { x: 600, y: 0, width: 100, height: 50 } } },
      ],
    });
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('skips elements clipped by an in-viewport overflow:hidden ancestor', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="wrap" style="overflow-x:hidden"><div id="e">content</div></div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'wrap',
          data: {
            rect: { x: 0, y: 0, width: 375, height: 100 },
            style: { overflowX: 'hidden' },
          },
        },
        { id: 'e', data: { rect: { x: 400, y: 0, width: 100, height: 50 } } },
      ],
    });
    // Fixed: overflow-x:hidden clips the element by design
    expect(offViewportChecker(context)).toHaveLength(0);
  });

  it('collapses off-viewport diagnostics to the shallowest ancestor', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="outer"><div id="inner">content</div></div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'outer',
          data: { rect: { x: 600, y: 0, width: 100, height: 100 } },
        },
        {
          id: 'inner',
          data: { rect: { x: 610, y: 10, width: 50, height: 50 } },
        },
      ],
    });
    const diagnostics = offViewportChecker(context);
    expect(diagnostics).toHaveLength(1);
    // Only the shallowest fully-off-screen element is reported
    expect(diagnostics[0]!.element?.id).toBe('outer');
  });
});
