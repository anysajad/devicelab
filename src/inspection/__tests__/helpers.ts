import type {
  ComputedStyleSnapshot,
  InspectionContext,
  MeasurementAdapter,
  ViewportSize,
} from '../types';

/** Describes an element in a test fixture. */
export interface MockedElementMeasurements {
  rect?: Partial<DOMRect>;
  scrollWidth?: number;
  scrollHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  style?: Partial<ComputedStyleSnapshot>;
}

const DEFAULT_STYLE: ComputedStyleSnapshot = {
  position: 'static',
  overflow: 'visible',
  overflowX: 'visible',
  overflowY: 'visible',
  textOverflow: 'clip',
  whiteSpace: 'normal',
  display: 'block',
  visibility: 'visible',
  zIndex: 'auto',
  width: 'auto',
  height: 'auto',
  pointerEvents: 'auto',
};

/**
 * Create a deterministic mock MeasurementAdapter.
 *
 * Tests register explicit measurements per element. Any element without a
 * registered measurement returns neutral defaults (zero geometry, visible).
 */
export function createMockMeasurementAdapter(
  measurements: Map<Element, MockedElementMeasurements>
): MeasurementAdapter {
  function lookup(el: Element): MockedElementMeasurements {
    return measurements.get(el) ?? {};
  }

  return {
    getElementRect(el: Element): DOMRect {
      const r = lookup(el).rect ?? {};
      const width = r.width ?? 0;
      const height = r.height ?? 0;
      const x = r.x ?? r.left ?? 0;
      const y = r.y ?? r.top ?? 0;
      return {
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      } as DOMRect;
    },

    getComputedStyle(el: Element): ComputedStyleSnapshot {
      return { ...DEFAULT_STYLE, ...(lookup(el).style ?? {}) };
    },

    getScrollWidth(el: Element): number {
      return lookup(el).scrollWidth ?? 0;
    },

    getScrollHeight(el: Element): number {
      return lookup(el).scrollHeight ?? 0;
    },

    getClientDimensions(el: Element): {
      clientWidth: number;
      clientHeight: number;
    } {
      return {
        clientWidth: lookup(el).clientWidth ?? 0,
        clientHeight: lookup(el).clientHeight ?? 0,
      };
    },
  };
}

/**
 * Create a minimal test document and context.
 *
 * Geometry comes entirely from the mocked adapter — NOT from jsdom layout.
 * DOM traversal/querying uses the real Document.
 */
export function setupInspectionTest(options: {
  viewport?: ViewportSize;
  /** Elements to add to the document body. */
  bodyHtml?: string;
  /** Measurements keyed by element reference tag (or id). */
  measurements?: Array<{
    tag?: string;
    id?: string;
    data: MockedElementMeasurements;
  }>;
}): {
  document: Document;
  adapter: MeasurementAdapter;
  context: InspectionContext;
  elements: Element[];
  getByTag: (tag: string, index?: number) => Element;
} {
  const document = createTestDocument(options.bodyHtml ?? '');

  const measurements = new Map<Element, MockedElementMeasurements>();
  if (options.measurements) {
    for (const m of options.measurements) {
      const el = m.id
        ? document.getElementById(m.id)
        : findFirstByTag(document, m.tag ?? 'div');
      if (el) measurements.set(el, m.data);
    }
  }

  const adapter = createMockMeasurementAdapter(measurements);
  const viewport = options.viewport ?? { width: 375, height: 812 };
  const elements = Array.from(document.querySelectorAll('*'));
  const context: InspectionContext = {
    document,
    viewport,
    measurements: adapter,
    elements,
  };

  return {
    document,
    adapter,
    context,
    elements,
    getByTag: (tag: string, index = 0) => {
      const all = document.getElementsByTagName(tag);
      return all[index]!;
    },
  };
}

/** Create a minimal valid Document (jsdom). */
export function createTestDocument(bodyHtml = ''): Document {
  const doc = document.implementation.createHTMLDocument('inspection-test');
  doc.body.innerHTML = bodyHtml;
  return doc;
}

function findFirstByTag(doc: Document, tag: string): Element | null {
  const all = doc.getElementsByTagName(tag);
  return all[0] ?? null;
}
