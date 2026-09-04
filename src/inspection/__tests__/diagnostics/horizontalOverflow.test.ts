import { describe, expect, it } from 'vitest';

import { horizontalOverflowChecker } from '../../diagnostics/horizontalOverflow';
import { setupInspectionTest } from '../helpers';

describe('horizontalOverflowChecker', () => {
  it('detects document wider than viewport', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>content</div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { tag: 'html', data: { scrollWidth: 500 } },
        { tag: 'body', data: { scrollWidth: 500 } },
      ],
    });
    // Provide documentElement/body scroll widths explicitly
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.type).toBe('horizontal-overflow');
    expect(diagnostics[0]!.metadata).toMatchObject({
      overflowPx: 125,
      viewportWidth: 375,
    });
  });

  it('detects body wider than viewport', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>content</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = (el) =>
      el.tagName === 'BODY' ? 500 : 375;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
  });

  it('returns no diagnostic when there is no overflow', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>content</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = () => 350;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(0);
  });

  it('applies 1px subpixel tolerance', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>content</div>',
      viewport: { width: 375, height: 812 },
    });
    // 1px over — within 2px tolerance
    context.measurements.getScrollWidth = () => 376;
    expect(horizontalOverflowChecker(context)).toHaveLength(0);
    // 2px over — boundary of tolerance (still within)
    context.measurements.getScrollWidth = () => 377;
    expect(horizontalOverflowChecker(context)).toHaveLength(0);
    // 3px over — beyond tolerance
    context.measurements.getScrollWidth = () => 378;
    expect(horizontalOverflowChecker(context)).toHaveLength(1);
  });

  it('returns error severity for large overflow', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = () => 700;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('error');
  });

  it('returns warning severity for medium overflow', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = () => 425;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('returns info severity for small overflow above tolerance', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = () => 380;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('info');
  });

  it('identifies the likely source element', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="narrow"><span id="wide">long content</span></div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { id: 'wide', data: { rect: { x: 0, y: 0, width: 500, height: 20 } } },
        {
          id: 'narrow',
          data: { rect: { x: 0, y: 0, width: 375, height: 20 } },
        },
      ],
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.element?.tagName).toBe('span');
  });

  it('produces only one diagnostic despite multiple overflowing descendants', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="a"><span class="wide1">x</span><span class="wide2">y</span><span class="wide3">z</span></div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { tag: 'span', data: { rect: { x: 0, y: 0, width: 500, height: 20 } } },
      ],
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
  });
});
