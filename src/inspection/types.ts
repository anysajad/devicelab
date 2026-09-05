// --- Diagnostic severity ---

type DiagnosticSeverity = 'info' | 'warning' | 'error';

// --- Diagnostic types (initial set) ---

type DiagnosticType =
  | 'horizontal-overflow'
  | 'off-viewport'
  | 'text-overflow'
  | 'fixed-overlap'
  | 'touch-target';

// --- Element reference (lightweight, serializable, no live DOM ref) ---

interface ElementReference {
  /** Best-effort CSS selector: tagName#id.class1.class2 */
  selector?: string;
  tagName: string;
  id?: string;
  className?: string;
  /** Truncated textContent (first ~80 chars). */
  text?: string;
}

// --- Diagnostic ---

interface Diagnostic {
  /** Deterministic ID derived from type + element signature + metadata. */
  id: string;
  type: DiagnosticType;
  severity: DiagnosticSeverity;
  message: string;
  /** Reference to the offending DOM element, if applicable. */
  element?: ElementReference;
  /** Reference to a secondary related element, if any (e.g. a collision partner). */
  relatedElement?: ElementReference;
  /** Type-specific extra data. */
  metadata?: Record<string, unknown>;
}

// --- Viewport ---

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

// --- Computed style snapshot (narrow subset needed by diagnostics) ---

interface ComputedStyleSnapshot {
  readonly position: string;
  readonly overflow: string;
  readonly overflowX: string;
  readonly overflowY: string;
  readonly textOverflow: string;
  readonly whiteSpace: string;
  readonly display: string;
  readonly visibility: string;
  readonly zIndex: string;
  readonly width: string;
  readonly height: string;
  readonly pointerEvents: string;
}

// --- Measurement adapter (abstracts browser layout for testability) ---

interface MeasurementAdapter {
  getElementRect(el: Element): DOMRect;
  getComputedStyle(el: Element): ComputedStyleSnapshot;
  getScrollWidth(el: Element): number;
  getScrollHeight(el: Element): number;
  getClientDimensions(el: Element): {
    clientWidth: number;
    clientHeight: number;
  };
}

// --- Inspection context ---

interface InspectionContext {
  /** The document to inspect. */
  document: Document;
  /** Device viewport dimensions (from PreviewController.getState().viewport). */
  viewport: ViewportSize;
  /** Measurement adapter — production uses real DOM, tests use mocks. */
  measurements: MeasurementAdapter;
  /** Pre-filtered inspectable elements (computed once by orchestrator). */
  elements: readonly Element[];
}

// --- Inspection status (discriminated union) ---

interface InspectionStatusLoading {
  /** iframe exists but document is not yet ready for inspection. */
  status: 'loading';
}

interface InspectionStatusReady {
  /** Document was accessible and inspected successfully. */
  status: 'ready';
  /** Diagnostics produced. Empty array = clean page, not failure. */
  diagnostics: Diagnostic[];
  /** Viewport dimensions used for this inspection. */
  viewport: ViewportSize;
  /** Number of DOM elements scanned. */
  elementsScanned: number;
  /** True if the DOM exceeded the scan bound and inspection was limited. */
  largeDom?: boolean;
  /** Per-checker failures, if any checker threw (does not corrupt diagnostics). */
  checkerFailures?: ReadonlyArray<{ message: string }>;
}

interface InspectionStatusInaccessible {
  /** Document exists but contentDocument is not accessible. */
  status: 'inaccessible';
  /** Why inspection was not possible. */
  reason: 'cross-origin' | 'contentDocument-unavailable';
}

interface InspectionStatusError {
  /** An unexpected error occurred during inspection. */
  status: 'error';
  /** Human-readable error description. */
  message: string;
  /** The original error, if any. */
  cause?: unknown;
}

type InspectionStatus =
  | InspectionStatusLoading
  | InspectionStatusReady
  | InspectionStatusInaccessible
  | InspectionStatusError;

// --- Inspection result ---

interface InspectionResult {
  /** Discriminated status — determines which other fields are populated. */
  status: InspectionStatus;
  /** Timestamp of the inspection attempt. */
  inspectedAt: number;
}

// --- Checker function type ---

/** Deterministic, side-effect-free checker given an InspectionContext. */
type DiagnosticChecker = (context: InspectionContext) => Diagnostic[];

export type {
  Diagnostic,
  DiagnosticChecker,
  DiagnosticSeverity,
  DiagnosticType,
  ElementReference,
  InspectionContext,
  InspectionResult,
  InspectionStatus,
  InspectionStatusError,
  InspectionStatusInaccessible,
  InspectionStatusLoading,
  InspectionStatusReady,
  MeasurementAdapter,
  ComputedStyleSnapshot,
  ViewportSize,
};
