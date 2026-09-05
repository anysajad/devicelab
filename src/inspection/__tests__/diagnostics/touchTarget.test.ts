import { describe, expect, it } from 'vitest';

import { touchTargetChecker } from '../../diagnostics/touchTarget';
import { setupInspectionTest } from '../helpers';

const VIEWPORT = { width: 375, height: 812 };

describe('touchTargetChecker', () => {
  it('reports an interactive element below the 24px floor as a warning', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<button id="b">Tap</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'b', data: { rect: { x: 0, y: 0, width: 20, height: 20 } } },
      ],
    });
    const diagnostics = touchTargetChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.type).toBe('touch-target');
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('reports elements between 24px and 44px as info', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<a href="#" id="a">Link</a>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'a', data: { rect: { x: 0, y: 0, width: 30, height: 30 } } },
      ],
    });
    const diagnostics = touchTargetChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('info');
  });

  it('does not report elements at or above the 44px recommendation', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<button id="b">Tap</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'b', data: { rect: { x: 0, y: 0, width: 44, height: 44 } } },
      ],
    });
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('includes size metadata and thresholds', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<button id="b">Tap</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'b', data: { rect: { x: 0, y: 0, width: 30, height: 20 } } },
      ],
    });
    const diagnostics = touchTargetChecker(context);
    expect(diagnostics[0]!.metadata).toMatchObject({
      measuredWidth: 30,
      measuredHeight: 20,
      recommendedMin: 44,
      absoluteMin: 24,
    });
  });

  it('flags elements undersized on a single axis', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<button id="b">Tap</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'b', data: { rect: { x: 0, y: 0, width: 200, height: 18 } } },
      ],
    });
    const diagnostics = touchTargetChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('excludes disabled and aria-disabled controls', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<button id="d" disabled>No</button><button id="ad" aria-disabled="true">No</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'd', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
        { id: 'ad', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
      ],
    });
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('excludes hidden, aria-hidden and display:none elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<button id="h" hidden>No</button><button id="ah" aria-hidden="true">No</button><button id="dn" style="display:none">No</button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'h', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
        { id: 'ah', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
        {
          id: 'dn',
          data: {
            rect: { x: 0, y: 0, width: 10, height: 10 },
            style: { display: 'none' },
          },
        },
      ],
    });
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('excludes non-interactive elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="d">Not a control</div>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'd', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
      ],
    });
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('excludes plain links without an href', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<a id="a">Not a link</a>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'a', data: { rect: { x: 0, y: 0, width: 10, height: 10 } } },
      ],
    });
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('collapses nested interactive elements to the outer target', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<button id="outer"><div id="inner" tabindex="0">x</div></button>',
      viewport: VIEWPORT,
      measurements: [
        { id: 'outer', data: { rect: { x: 0, y: 0, width: 60, height: 60 } } },
        { id: 'inner', data: { rect: { x: 5, y: 5, width: 15, height: 15 } } },
      ],
    });
    // outer is well-sized; inner is nested inside it → only outer matters
    expect(touchTargetChecker(context)).toHaveLength(0);
  });

  it('caps reported diagnostics at 20 and communicates suppression', () => {
    let html = '';
    const measurements: Array<{
      id: string;
      data: { rect: { x: number; y: number; width: number; height: number } };
    }> = [];
    for (let i = 0; i < 25; i++) {
      html += `<button id="b${i}">Tap ${i}</button>`;
      measurements.push({
        id: `b${i}`,
        data: { rect: { x: 0, y: i * 30, width: 20, height: 20 } },
      });
    }
    const { context } = setupInspectionTest({
      bodyHtml: html,
      viewport: VIEWPORT,
      measurements,
    });
    const diagnostics = touchTargetChecker(context);
    // 20 reported + 1 suppression note
    expect(diagnostics).toHaveLength(21);
    expect(diagnostics[20]!.metadata).toMatchObject({ suppressed: 5 });
  });
});
