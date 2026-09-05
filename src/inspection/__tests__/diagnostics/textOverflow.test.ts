import { describe, expect, it } from 'vitest';

import { textOverflowChecker } from '../../diagnostics/textOverflow';
import { setupInspectionTest } from '../helpers';

const VIEWPORT = { width: 375, height: 812 };

describe('textOverflowChecker', () => {
  it('detects horizontal text overflow', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">This is some long text about a thing</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.type).toBe('text-overflow');
    expect(diagnostics[0]!.metadata).toMatchObject({ direction: 'horizontal' });
  });

  it('detects vertical text overflow', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">lots of text here</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 100,
            clientWidth: 100,
            scrollHeight: 200,
            clientHeight: 50,
            style: { height: '50px' },
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.metadata).toMatchObject({ direction: 'vertical' });
  });

  it('ignores vertical overflow when height is auto (no clipping possible)', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">lots of text here</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 100,
            clientWidth: 100,
            scrollHeight: 200,
            clientHeight: 50,
            style: { height: 'auto' },
          },
        },
      ],
    });
    // height:auto means the box grows with content — nothing is clipped
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('detects no overflow normally', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 100,
            clientWidth: 100,
            scrollHeight: 20,
            clientHeight: 20,
          },
        },
      ],
    });
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('excludes scrollable containers', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
            style: { overflowX: 'auto' },
          },
        },
      ],
    });
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('excludes ellipsis truncation', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
            style: { textOverflow: 'ellipsis' },
          },
        },
      ],
    });
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('excludes elements with no direct text content', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e"><span>child</span></div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
          },
        },
      ],
    });
    // #e has only a child span, no direct text — excluded
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('excludes hidden elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
            style: { display: 'none' },
          },
        },
      ],
    });
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('includes dimension metadata', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics[0]!.metadata).toMatchObject({
      scrollWidth: 300,
      clientWidth: 100,
      overflowPx: 200,
    });
  });

  it('excludes zero-sized containers', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 0,
            clientWidth: 0,
            scrollHeight: 0,
            clientHeight: 0,
          },
        },
      ],
    });
    expect(textOverflowChecker(context)).toHaveLength(0);
  });

  it('caps at 15 findings', () => {
    let html = '';
    const measurements: Array<{
      id: string;
      data: {
        scrollWidth: number;
        clientWidth: number;
        scrollHeight: number;
        clientHeight: number;
      };
    }> = [];
    for (let i = 0; i < 20; i++) {
      html += `<div id="e${i}">text ${i}</div>`;
      measurements.push({
        id: `e${i}`,
        data: {
          scrollWidth: 300,
          clientWidth: 100,
          scrollHeight: 40,
          clientHeight: 40,
        },
      });
    }
    const { context } = setupInspectionTest({
      bodyHtml: html,
      viewport: VIEWPORT,
      measurements,
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics.length).toBeLessThanOrEqual(15);
  });

  it('marks horizontal overflow with wrapping whitespace as uncertain', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics[0]!.severity).toBe('warning');
    expect(diagnostics[0]!.metadata).toMatchObject({
      direction: 'horizontal',
      whiteSpace: 'normal',
      uncertain: true,
    });
  });

  it('treats nowrap horizontal overflow as certain truncation', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 300,
            clientWidth: 100,
            scrollHeight: 40,
            clientHeight: 40,
            style: { whiteSpace: 'nowrap' },
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics[0]!.metadata).toMatchObject({
      whiteSpace: 'nowrap',
      uncertain: false,
    });
  });

  it('downgrades vertical overflow to info when clipped by overflow-y:hidden', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">text</div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'e',
          data: {
            scrollWidth: 100,
            clientWidth: 100,
            scrollHeight: 200,
            clientHeight: 50,
            style: { height: '50px', overflowY: 'hidden' },
          },
        },
      ],
    });
    const diagnostics = textOverflowChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe('info');
    expect(diagnostics[0]!.metadata).toMatchObject({
      direction: 'vertical',
      clipped: true,
    });
  });
});
