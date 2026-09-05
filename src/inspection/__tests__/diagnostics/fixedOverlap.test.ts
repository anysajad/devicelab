import { describe, expect, it } from 'vitest';

import { fixedOverlapChecker } from '../../diagnostics/fixedOverlap';
import { setupInspectionTest } from '../helpers';

const VIEWPORT = { width: 375, height: 812 };

describe('fixedOverlapChecker', () => {
  it('reports fixed element overlapping meaningful content', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:fixed;width:100px;height:100px"></div><main id="content" style="width:200px;height:200px"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'static' },
          },
        },
      ],
    });
    const diagnostics = fixedOverlapChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.type).toBe('fixed-overlap');
    expect(diagnostics[0]!.element?.tagName).toBe('div');
  });

  it('does not report when there is no overlap', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:fixed;width:100px;height:100px"></div><main id="content" style="width:100px;height:100px"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 300, y: 600, width: 50, height: 50 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('ignores tiny fixed elements', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:fixed;width:5px;height:5px"></div><main id="content"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 5, height: 5 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 300, height: 500 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('excludes ancestor/descendant relationships', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="overlay"><main id="content">text</main></div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 300, height: 500 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 100 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('reports sticky element with actual geometry overlap and uncertainty metadata', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:sticky;width:100px;height:100px"></div><section id="content"></section>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'sticky' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'static' },
          },
        },
      ],
    });
    const diagnostics = fixedOverlapChecker(context);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.metadata).toMatchObject({
      stickyState: 'possibly-not-stuck',
    });
  });

  it('does not report sticky element with no actual geometry overlap', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:sticky;width:100px;height:100px"></div><section id="content"></section>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 300, y: 700, width: 50, height: 50 },
            style: { position: 'sticky' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 300, height: 500 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('ignores overlaps below the intersection area threshold', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:fixed;width:100px;height:100px"></div><main id="content"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 90, y: 90, width: 300, height: 500 },
            style: { position: 'static' },
          },
        },
      ],
    });
    // Intersection is 10x10 = 100px² < 500 threshold
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('ignores overlaps below the 10% content area threshold', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="overlay" style="position:fixed;width:100px;height:100px"></div><main id="content"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'overlay',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 2000, height: 2000 },
            style: { position: 'static' },
          },
        },
      ],
    });
    // Intersection is 100x100 = 10000px² but content area is 4,000,000px²
    // Fraction = 0.0025 < 0.1 → ignored
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('handles multiple overlay candidates', () => {
    const bodyHtml =
      Array.from(
        { length: 5 },
        (_, i) =>
          `<div id="overlay${i}" style="position:fixed;width:100px;height:100px"></div>`
      ).join('') + '<main id="content"></main>';
    const measurements: Array<{
      id: string;
      data: {
        rect: { x: number; y: number; width: number; height: number };
        style: { position: 'fixed' | 'static' };
      };
    }> = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `overlay${i}`,
        data: {
          rect: { x: 0, y: 0, width: 100, height: 100 },
          style: { position: 'fixed' as const },
        },
      })),
      {
        id: 'content',
        data: {
          rect: { x: 0, y: 0, width: 200, height: 200 },
          style: { position: 'static' as const },
        },
      },
    ];
    const { context } = setupInspectionTest({
      bodyHtml,
      viewport: VIEWPORT,
      measurements,
    });
    const diagnostics = fixedOverlapChecker(context);
    // 5 overlay×content findings + 5 fixed-vs-fixed collisions (10 pairs,
    // capped at 5) → each of the 5 identical stacked elements collides with
    // the others in the same region.
    expect(diagnostics.length).toBe(10);
  });

  it('excludes overlay/modal/role fixed elements from overlap reporting', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="dialog" role="dialog" style="position:fixed;width:100px;height:100px"></div><main id="content" style="width:200px;height:200px"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'dialog',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('excludes aria-modal fixed overlays', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="modal" aria-modal="true" style="position:fixed;width:100px;height:100px"></div><main id="content" style="width:200px;height:200px"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'modal',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'static' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('reports fixed-vs-fixed collisions with a relatedElement', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="a" style="position:fixed;width:100px;height:100px"></div><div id="b" style="position:fixed;width:100px;height:100px"></div><main id="content" style="width:200px;height:200px"></main>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'a',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'b',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'content',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'static' },
          },
        },
      ],
    });
    const diagnostics = fixedOverlapChecker(context);
    // 2 overlay×content + 1 collision
    expect(diagnostics).toHaveLength(3);
    const collision = diagnostics.find((d) => d.relatedElement);
    expect(collision).toBeDefined();
    expect(collision!.element?.id).toBe('a');
    expect(collision!.relatedElement?.id).toBe('b');
    expect(collision!.metadata).toMatchObject({ intersectionArea: 10000 });
  });

  it('excludes nested fixed pairs from collisions', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<div id="a" style="position:fixed;width:200px;height:200px"><div id="b" style="position:fixed;width:100px;height:100px"></div></div>',
      viewport: VIEWPORT,
      measurements: [
        {
          id: 'a',
          data: {
            rect: { x: 0, y: 0, width: 200, height: 200 },
            style: { position: 'fixed' },
          },
        },
        {
          id: 'b',
          data: {
            rect: { x: 0, y: 0, width: 100, height: 100 },
            style: { position: 'fixed' },
          },
        },
      ],
    });
    expect(fixedOverlapChecker(context)).toHaveLength(0);
  });

  it('caps fixed-vs-fixed collisions separately from overlay findings', () => {
    const bodyHtml =
      Array.from(
        { length: 6 },
        (_, i) =>
          `<div id="o${i}" style="position:fixed;width:100px;height:100px"></div>`
      ).join('') + '<main id="content"></main>';
    const measurements: Array<{
      id: string;
      data: {
        rect: { x: number; y: number; width: number; height: number };
        style: { position: 'fixed' | 'static' };
      };
    }> = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `o${i}`,
        data: {
          rect: { x: 0, y: 0, width: 100, height: 100 },
          style: { position: 'fixed' as const },
        },
      })),
      {
        id: 'content',
        data: {
          rect: { x: 0, y: 0, width: 200, height: 200 },
          style: { position: 'static' as const },
        },
      },
    ];
    const { context } = setupInspectionTest({
      bodyHtml,
      viewport: VIEWPORT,
      measurements,
    });
    const diagnostics = fixedOverlapChecker(context);
    const collisions = diagnostics.filter((d) => d.relatedElement);
    // 15 possible pairs among 6 elements → capped at 5
    expect(collisions).toHaveLength(5);
  });
});
