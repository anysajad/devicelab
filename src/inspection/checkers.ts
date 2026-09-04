import type { DiagnosticChecker } from './types';
import { horizontalOverflowChecker } from './diagnostics/horizontalOverflow';
import { offViewportChecker } from './diagnostics/offViewport';
import { textOverflowChecker } from './diagnostics/textOverflow';
import { fixedOverlapChecker } from './diagnostics/fixedOverlap';

/**
 * Immutable static checker registry.
 *
 * No mutable global registration API — this array is frozen and shared
 * safely across concurrent inspections. Callers may compose their own
 * list by spreading this and adding custom checkers.
 */
export const DEFAULT_CHECKERS: readonly DiagnosticChecker[] = Object.freeze([
  horizontalOverflowChecker,
  offViewportChecker,
  textOverflowChecker,
  fixedOverlapChecker,
]);
