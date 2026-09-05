import { describe, expect, it } from 'vitest';

import {
  findClippingAncestor,
  findOffViewportAncestor,
  hasInteractiveAncestor,
  isFullyOutsideViewport,
  isInteractiveElement,
  isOutsideViewportWithTolerance,
  isPartiallyOutsideViewport,
} from '../utils';
import { createMockMeasurementAdapter, createTestDocument } from './helpers';
import type { MockedElementMeasurements } from './helpers';
import type { MeasurementAdapter } from '../types';

const VIEWPORT = { width: 375, height: 812 };

function makeDoc(bodyHtml: string): {
  document: Document;
  adapter: MeasurementAdapter;
  measurements: Map<Element, MockedElementMeasurements>;
  getById: (id: string) => Element;
} {
  const document = createTestDocument(bodyHtml);
  const measurements = new Map<Element, MockedElementMeasurements>();
  const adapter = createMockMeasurementAdapter(measurements);
  return {
    document,
    adapter,
    measurements,
    getById: (id: string) => document.getElementById(id)!,
  };
}

describe('isInteractiveElement', () => {
  it('matches standard interactive controls', () => {
    const doc = createTestDocument(
      '<button id="b"></button><a href="#" id="a"></a><input id="i"><select id="s"><option>o</option></select><textarea id="t"></textarea>'
    );
    expect(isInteractiveElement(doc.getElementById('b')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('a')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('i')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('s')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('t')!)).toBe(true);
  });

  it('matches ARIA roles and positive tabindex', () => {
    const doc = createTestDocument(
      '<span role="button" id="rb"></span><span role="switch" id="sw"></span><div tabindex="0" id="tb"></div>'
    );
    expect(isInteractiveElement(doc.getElementById('rb')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('sw')!)).toBe(true);
    expect(isInteractiveElement(doc.getElementById('tb')!)).toBe(true);
  });

  it('excludes non-interactive and inert variants', () => {
    const doc = createTestDocument(
      '<div id="d"></div><a id="plain"></a><input type="hidden" id="h"><div tabindex="-1" id="neg"></div>'
    );
    expect(isInteractiveElement(doc.getElementById('d')!)).toBe(false);
    expect(isInteractiveElement(doc.getElementById('plain')!)).toBe(false);
    expect(isInteractiveElement(doc.getElementById('h')!)).toBe(false);
    expect(isInteractiveElement(doc.getElementById('neg')!)).toBe(false);
  });
});

describe('hasInteractiveAncestor', () => {
  it('returns true when an ancestor is interactive', () => {
    const doc = createTestDocument(
      '<button id="b"><span id="s"><em id="e">x</em></span></button>'
    );
    expect(hasInteractiveAncestor(doc.getElementById('e')!)).toBe(true);
    expect(hasInteractiveAncestor(doc.getElementById('s')!)).toBe(true);
  });

  it('returns false with no interactive ancestor', () => {
    const doc = createTestDocument('<div id="d"><em id="e">x</em></div>');
    expect(hasInteractiveAncestor(doc.getElementById('e')!)).toBe(false);
  });
});

describe('viewport geometry helpers', () => {
  function rect(x: number, y: number, width: number, height: number) {
    return {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
    } as DOMRect;
  }

  it('classifies fully outside elements', () => {
    expect(isFullyOutsideViewport(rect(600, 0, 100, 50), VIEWPORT)).toBe(true);
    expect(isFullyOutsideViewport(rect(-100, 0, 100, 50), VIEWPORT)).toBe(true);
    expect(isFullyOutsideViewport(rect(0, 900, 100, 50), VIEWPORT)).toBe(true);
    expect(isFullyOutsideViewport(rect(0, 0, 100, 50), VIEWPORT)).toBe(false);
  });

  it('classifies partial and inside elements', () => {
    expect(isPartiallyOutsideViewport(rect(350, 10, 110, 50), VIEWPORT)).toBe(
      true
    );
    expect(isPartiallyOutsideViewport(rect(10, 10, 100, 50), VIEWPORT)).toBe(
      false
    );
  });

  it('applies edge tolerance', () => {
    // 1px bleed — within tolerance
    expect(
      isOutsideViewportWithTolerance(rect(0, 0, 376, 50), VIEWPORT, 1)
    ).toBe(false);
    // 2px bleed — beyond tolerance
    expect(
      isOutsideViewportWithTolerance(rect(0, 0, 377, 50), VIEWPORT, 1)
    ).toBe(true);
  });
});

describe('findOffViewportAncestor', () => {
  it('finds a fully-off-screen ancestor', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="outer"><div id="inner">x</div></div>'
    );
    measurements.set(getById('outer'), {
      rect: { x: 800, y: 0, width: 100, height: 100 },
    });
    measurements.set(getById('inner'), {
      rect: { x: 810, y: 10, width: 50, height: 50 },
    });
    expect(findOffViewportAncestor(getById('inner'), VIEWPORT, adapter)).toBe(
      getById('outer')
    );
  });

  it('returns null for elements whose ancestors are in view', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="outer"><div id="inner">x</div></div>'
    );
    measurements.set(getById('outer'), {
      rect: { x: 0, y: 0, width: 200, height: 200 },
    });
    measurements.set(getById('inner'), {
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    expect(findOffViewportAncestor(getById('inner'), VIEWPORT, adapter)).toBe(
      null
    );
  });

  it('never treats html/body as off-screen ancestors', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="outer"><div id="inner">x</div></div>'
    );
    // Even if body measured zeros (logic guard), elements under it must not
    // collapse to the document root.
    measurements.set(getById('outer'), {
      rect: { x: 800, y: 0, width: 100, height: 100 },
    });
    measurements.set(getById('inner'), {
      rect: { x: 810, y: 10, width: 50, height: 50 },
    });
    expect(findOffViewportAncestor(getById('outer'), VIEWPORT, adapter)).toBe(
      null
    );
  });
});

describe('findClippingAncestor', () => {
  it('finds an in-viewport overflow:hidden ancestor on the matching axis', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="wrap"><span id="item">x</span></div>'
    );
    measurements.set(getById('wrap'), {
      rect: { x: 0, y: 0, width: 375, height: 100 },
      style: { overflowX: 'hidden' },
    });
    measurements.set(getById('item'), {
      rect: { x: 400, y: 0, width: 100, height: 20 },
    });
    expect(findClippingAncestor(getById('item'), 'x', VIEWPORT, adapter)).toBe(
      getById('wrap')
    );
    // overflowX:hidden does not clip the vertical axis
    expect(findClippingAncestor(getById('item'), 'y', VIEWPORT, adapter)).toBe(
      null
    );
  });

  it('ignores ancestors that are themselves off-screen', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="wrap"><span id="item">x</span></div>'
    );
    measurements.set(getById('wrap'), {
      rect: { x: 800, y: 0, width: 100, height: 100 },
      style: { overflowX: 'hidden' },
    });
    measurements.set(getById('item'), {
      rect: { x: 850, y: 10, width: 50, height: 50 },
    });
    // wrap is off-screen → not a "deliberate crop", so no clipping ancestor
    expect(findClippingAncestor(getById('item'), 'x', VIEWPORT, adapter)).toBe(
      null
    );
  });

  it('never treats html/body as clipping ancestors', () => {
    const { adapter, measurements, getById } = makeDoc(
      '<div id="item">x</div>'
    );
    measurements.set(getById('item'), {
      rect: { x: 400, y: 0, width: 100, height: 20 },
    });
    expect(findClippingAncestor(getById('item'), 'x', VIEWPORT, adapter)).toBe(
      null
    );
  });
});
