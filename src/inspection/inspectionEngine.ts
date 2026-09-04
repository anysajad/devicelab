import type {
  Diagnostic,
  DiagnosticChecker,
  InspectionContext,
  InspectionResult,
  MeasurementAdapter,
  ViewportSize,
} from './types';
import { DEFAULT_CHECKERS } from './checkers';
import { DOMMeasurementAdapter } from './measurement';
import { getInspectableElements, MAX_ELEMENTS } from './utils';

/** Create an InspectionContext from a Document, viewport, and measurement adapter. */
export function createInspectionContext(
  document: Document,
  viewport: ViewportSize,
  measurements: MeasurementAdapter = DOMMeasurementAdapter
): InspectionContext {
  const elements = getInspectableElements(document);
  return { document, viewport, measurements, elements };
}

/**
 * Run all registered diagnostic checkers and collect the results.
 *
 * - Builds the inspectable element list once.
 * - Runs checkers in order.
 * - Collects diagnostics with deterministic ordering.
 * - Prevents duplicate diagnostic IDs.
 * - Safely handles checker exceptions (never crashes inspection).
 * - Never modifies the DOM.
 */
export function runInspection(
  context: InspectionContext,
  checkers: readonly DiagnosticChecker[] = DEFAULT_CHECKERS
): InspectionResult {
  const { viewport, elements } = context;
  const diagnostics: Diagnostic[] = [];
  const seenIds = new Set<string>();
  const failures: Array<{ message: string }> = [];
  let elementsScanned = elements.length;

  // Bounded work: if the DOM is unusually large, inspect only the bounded set
  // and communicate that inspection was limited.
  let workSet: readonly Element[] = elements;
  const largeDom = elements.length > MAX_ELEMENTS;
  if (largeDom) {
    workSet = elements.slice(0, MAX_ELEMENTS);
    elementsScanned = MAX_ELEMENTS;
  }

  const boundedContext: InspectionContext = {
    ...context,
    elements: workSet,
  };

  for (const checker of checkers) {
    let checkerDiagnostics: Diagnostic[];
    try {
      checkerDiagnostics = checker(boundedContext) ?? [];
    } catch (err) {
      // A checker failed — represent the failure within the ready status
      // without corrupting the DiagnosticType model.
      failures.push({
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const d of checkerDiagnostics) {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        diagnostics.push(d);
      }
    }
  }

  return {
    status: {
      status: 'ready',
      diagnostics,
      viewport,
      elementsScanned,
      largeDom,
      checkerFailures: failures.length > 0 ? failures : undefined,
    },
    inspectedAt: Date.now(),
  };
}

/**
 * Inspect an existing iframe.
 *
 * Never creates an iframe, never modifies iframe lifecycle. Uses
 * iframe.contentDocument when accessible. Gracefully handles:
 * - iframe missing
 * - loading / not-ready
 * - contentDocument unavailable
 * - cross-origin access restrictions
 * - unexpected DOM/access errors
 */
export function inspectIframe(
  iframe: HTMLIFrameElement,
  viewport: ViewportSize
): InspectionResult {
  const inspectedAt = Date.now();

  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    // Cross-origin access restriction
    return {
      status: { status: 'inaccessible', reason: 'cross-origin' },
      inspectedAt,
    };
  }

  if (!doc) {
    return {
      status: { status: 'inaccessible', reason: 'contentDocument-unavailable' },
      inspectedAt,
    };
  }

  // Document exists but may not be ready for inspection
  if (doc.readyState !== 'complete' && doc.readyState !== 'interactive') {
    return { status: { status: 'loading' }, inspectedAt };
  }

  try {
    const context = createInspectionContext(doc, viewport);
    return runInspection(context);
  } catch (err) {
    return {
      status: {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      },
      inspectedAt,
    };
  }
}
