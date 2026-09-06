import { describe, expect, it } from 'vitest';

import type { DiagnosticChecker, InspectionResult } from '../types';
import { createMockMeasurementAdapter } from './helpers';
import { setupInspectionTest } from './helpers';
import {
  createInspectionContext,
  inspectIframe,
  runInspection,
} from '../inspectionEngine';
import { DEFAULT_CHECKERS } from '../checkers';
import { createTestDocument } from './helpers';

function expectReady(result: InspectionResult) {
  expect(result.status.status).toBe('ready');
  if (result.status.status !== 'ready') {
    throw new Error('expected ready');
  }
  return result.status;
}

describe('runInspection', () => {
  it('returns ready with clean diagnostics for a minimal valid page', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div><p>Hello</p></div>',
    });
    const result = runInspection(context, []);
    const status = expectReady(result);
    expect(status.diagnostics).toEqual([]);
    expect(status.elementsScanned).toBeGreaterThan(0);
  });

  it('returns ready with diagnostics when issues are found', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="wide" style="width:1000px">content</div>',
      measurements: [
        {
          id: 'wide',
          data: { rect: { x: 0, y: 0, width: 1000, height: 100 } },
        },
      ],
    });
    const result = runInspection(context, [
      () => [],
      () => {
        return [
          {
            id: 'test-diagnostic',
            type: 'horizontal-overflow' as const,
            severity: 'warning' as const,
            message: 'found',
          },
        ];
      },
    ]);
    const status = expectReady(result);
    expect(status.diagnostics).toHaveLength(1);
    expect(status.diagnostics[0]!.message).toBe('found');
  });

  it('runs only the provided checkers', () => {
    const { context } = setupInspectionTest({ bodyHtml: '<div>x</div>' });
    let called = 0;
    const checker: DiagnosticChecker = () => {
      called++;
      return [];
    };
    runInspection(context, [checker]);
    expect(called).toBe(1);
  });

  it('suppresses duplicate diagnostic IDs', () => {
    const { context } = setupInspectionTest({ bodyHtml: '<div>x</div>' });
    const checker: DiagnosticChecker = () => [
      { id: 'dup', type: 'off-viewport', severity: 'info', message: 'a' },
      { id: 'dup', type: 'off-viewport', severity: 'info', message: 'b' },
    ];
    const status = expectReady(runInspection(context, [checker]));
    expect(status.diagnostics).toHaveLength(1);
    expect(status.diagnostics[0]!.message).toBe('a');
  });

  it('preserves deterministic ordering of diagnostics', () => {
    const { context } = setupInspectionTest({ bodyHtml: '<div>x</div>' });
    const checker: DiagnosticChecker = () => [
      { id: 'z', type: 'off-viewport', severity: 'info', message: 'z' },
      { id: 'a', type: 'off-viewport', severity: 'info', message: 'a' },
    ];
    const status = expectReady(runInspection(context, [checker]));
    expect(status.diagnostics.map((d) => d.id)).toEqual(['z', 'a']);
  });

  it('continues safely when a checker throws', () => {
    const { context } = setupInspectionTest({ bodyHtml: '<div>x</div>' });
    const okChecker: DiagnosticChecker = () => [
      { id: 'ok', type: 'off-viewport', severity: 'info', message: 'ok' },
    ];
    const throwChecker: DiagnosticChecker = () => {
      throw new Error('boom');
    };
    const status = expectReady(
      runInspection(context, [throwChecker, okChecker])
    );
    // The OK checker's diagnostic is still present
    expect(status.diagnostics.map((d) => d.id)).toContain('ok');
    expect(status.checkerFailures).toHaveLength(1);
    expect(status.checkerFailures![0]!.message).toContain('boom');
  });

  it('handles a large DOM by bounding the scan', () => {
    const doc = createTestDocument('<div id="root"></div>');
    const root = doc.getElementById('root')!;
    // Add more than MAX_ELEMENTS inspectable elements
    for (let i = 0; i < 5500; i++) {
      const el = doc.createElement('span');
      el.textContent = `x${i}`;
      root.appendChild(el);
    }
    const adapter = createMockMeasurementAdapter(new Map());
    const context = createInspectionContext(
      doc,
      { width: 375, height: 812 },
      adapter
    );
    const status = expectReady(runInspection(context, []));
    expect(status.largeDom).toBe(true);
    expect(status.elementsScanned).toBeLessThan(5500);
  });

  it('does not modify the DOM', () => {
    const { context, document } = setupInspectionTest({
      bodyHtml: '<div id="a"><p>Hello</p></div>',
    });
    const before = document.documentElement.outerHTML;
    runInspection(context, DEFAULT_CHECKERS);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('createInspectionContext', () => {
  it('returns a context with the inspectable element list', () => {
    const doc = createTestDocument(
      '<div><p>a</p><script>var x=1</script></div>'
    );
    const adapter = createMockMeasurementAdapter(new Map());
    const context = createInspectionContext(
      doc,
      { width: 375, height: 812 },
      adapter
    );
    // div and p are inspectable; script is excluded
    const tags = context.elements.map((e) => e.tagName);
    expect(tags).toContain('DIV');
    expect(tags).toContain('P');
    expect(tags).not.toContain('SCRIPT');
  });
});

describe('inspectIframe', () => {
  it('returns loading when document is not ready', () => {
    const iframe = document.createElement('iframe');
    // Simulate a not-ready document by setting readyState via a fake doc
    const fakeDoc = {
      readyState: 'loading',
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      value: fakeDoc,
      configurable: true,
    });

    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('loading');
  });

  it('returns inaccessible when contentDocument is unavailable', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      value: null,
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('inaccessible');
    if (result.status.status === 'inaccessible') {
      expect(result.status.reason).toBe('contentDocument-unavailable');
    }
  });

  it('reports a real cross-origin frame as cross-origin even when contentDocument is null', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'http://cross-origin.example/fixtures/clean.html';
    Object.defineProperty(iframe, 'contentDocument', {
      value: null,
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('inaccessible');
    if (result.status.status === 'inaccessible') {
      expect(result.status.reason).toBe('cross-origin');
    }
  });

  it('keeps contentDocument-unavailable for an about:blank frame', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    Object.defineProperty(iframe, 'contentDocument', {
      value: null,
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('inaccessible');
    if (result.status.status === 'inaccessible') {
      expect(result.status.reason).toBe('contentDocument-unavailable');
    }
  });

  it('returns inaccessible reason cross-origin when access throws', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('inaccessible');
    if (result.status.status === 'inaccessible') {
      expect(result.status.reason).toBe('cross-origin');
    }
  });

  it('returns ready for an inspectable iframe', () => {
    const iframe = document.createElement('iframe');
    const doc = createTestDocument('<div><p>hi</p></div>');
    // Simulate a ready document with complete state (preserve prototype/methods)
    Object.defineProperty(doc, 'readyState', {
      value: 'complete',
      configurable: true,
    });
    Object.defineProperty(iframe, 'contentDocument', {
      value: doc,
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('ready');
  });

  it('returns error for unexpected access errors', () => {
    const iframe = document.createElement('iframe');
    const doc = createTestDocument('<div><p>hi</p></div>');
    // Make getInspectableElements throw by replacing querySelectorAll
    Object.defineProperty(doc, 'querySelectorAll', {
      value() {
        throw new Error('unexpected');
      },
      configurable: true,
    });
    Object.defineProperty(doc, 'readyState', {
      value: 'complete',
      configurable: true,
    });
    Object.defineProperty(iframe, 'contentDocument', {
      value: doc,
      configurable: true,
    });
    const result = inspectIframe(iframe, { width: 375, height: 812 });
    expect(result.status.status).toBe('error');
  });
});

describe('inspection timestamp', () => {
  it('includes an inspectedAt timestamp', () => {
    const { context } = setupInspectionTest({ bodyHtml: '<div>x</div>' });
    const result = runInspection(context, []);
    expect(typeof result.inspectedAt).toBe('number');
  });
});

describe('deterministic IDs', () => {
  it('produces stable IDs across repeated inspections of the same DOM', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div id="e">content</div>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { id: 'e', data: { rect: { x: 600, y: 0, width: 100, height: 50 } } },
      ],
    });
    const first = expectReady(runInspection(context, DEFAULT_CHECKERS));
    const second = expectReady(runInspection(context, DEFAULT_CHECKERS));
    expect(first.diagnostics.map((d) => d.id)).toEqual(
      second.diagnostics.map((d) => d.id)
    );
  });
});

describe('robustness', () => {
  it('handles a minimal DOM', () => {
    const doc = createTestDocument('');
    const adapter = createMockMeasurementAdapter(new Map());
    const context = createInspectionContext(
      doc,
      { width: 375, height: 812 },
      adapter
    );
    const status = expectReady(runInspection(context, DEFAULT_CHECKERS));
    expect(status.diagnostics).toBeDefined();
  });

  it('handles a malformed/unusual DOM without crashing', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<div><!-- comment --></div><p>text</p>',
      viewport: { width: 375, height: 812 },
    });
    const status = expectReady(runInspection(context, DEFAULT_CHECKERS));
    expect(Array.isArray(status.diagnostics)).toBe(true);
  });

  it('all checkers run together without duplicate diagnostics', () => {
    const { context } = setupInspectionTest({
      bodyHtml:
        '<main><p style="width:200px">Normal text content here</p></main>',
      viewport: { width: 375, height: 812 },
      measurements: [
        {
          tag: 'main',
          data: { rect: { x: 0, y: 0, width: 375, height: 400 } },
        },
        { tag: 'p', data: { rect: { x: 0, y: 0, width: 200, height: 20 } } },
      ],
    });
    context.measurements.getScrollWidth = () => 375;
    const status = expectReady(runInspection(context, DEFAULT_CHECKERS));
    const ids = status.diagnostics.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs the touch-target checker as part of DEFAULT_CHECKERS', () => {
    const { context } = setupInspectionTest({
      bodyHtml: '<button id="btn">Tap</button>',
      viewport: { width: 375, height: 812 },
      measurements: [
        { id: 'btn', data: { rect: { x: 0, y: 0, width: 20, height: 20 } } },
      ],
    });
    const status = expectReady(runInspection(context, DEFAULT_CHECKERS));
    const types = status.diagnostics.map((d) => d.type);
    expect(types).toContain('touch-target');
  });
});
