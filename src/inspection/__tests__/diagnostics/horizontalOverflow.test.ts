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

  it('attributes left-side overflow (RTL) to the source element', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="rtl"><span id="s">محتوى</span></div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { id: 's', data: { rect: { x: -200, y: 0, width: 100, height: 20 } } },
      ],
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.metadata).toMatchObject({ direction: 'left' });
    expect(diagnostics[0]!.element?.tagName).toBe('span');
  });

  it('excludes fixed/sticky elements from source attribution', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="fixed" style="position:fixed;width:100px;height:100px">x</div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        {
          id: 'fixed',
          data: {
            rect: { x: 0, y: 0, width: 500, height: 100 },
            style: { position: 'fixed' },
          },
        },
      ],
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    // Fixed overlays do not push the document wider — no source attributed
    expect(diagnostics[0]!.element).toBeUndefined();
  });

  it('excludes elements cropped by an overflow:hidden ancestor', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="wrap" style="overflow-x:hidden;width:375px"><span id="inner">x</span></div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        {
          id: 'inner',
          data: { rect: { x: 400, y: 0, width: 100, height: 20 } },
        },
        {
          id: 'wrap',
          data: {
            rect: { x: 0, y: 0, width: 375, height: 100 },
            style: { overflowX: 'hidden' },
          },
        },
      ],
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.element).toBeUndefined();
  });

  it('downgrades severity when html/body declare horizontal scrolling', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
      measurements: [{ tag: 'body', data: { style: { overflowX: 'auto' } } }],
    });
    // 125px over would normally be a warning
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('info');
    expect(diagnostics[0]!.metadata).toMatchObject({ intentionalScroll: true });
  });

  it('downgrades error to warning for intentional scrolling', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
      measurements: [{ tag: 'html', data: { style: { overflowX: 'scroll' } } }],
    });
    // 400px over would normally be an error
    context.measurements.getScrollWidth = () => 775;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('warning');
    expect(diagnostics[0]!.metadata).toMatchObject({ intentionalScroll: true });
  });

  it('does not downgrade without declarative horizontal scrolling', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div>x</div>',
      viewport: { width: 375, height: 812 },
    });
    context.measurements.getScrollWidth = () => 500;
    const diagnostics = horizontalOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('warning');
    expect(diagnostics[0]!.metadata).not.toHaveProperty('intentionalScroll');
  });
});
