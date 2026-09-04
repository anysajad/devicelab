import type { ElementReference } from '@/inspection';

/**
 * CSS class applied to a same-origin preview element to visually highlight it.
 * Defining it via a class (rather than inline styles) keeps the engine and
 * highlight behavior out of the PreviewEngine's rendering and stays
 * best-effort + side-effect-scoped.
 */
export const HIGHLIGHT_CLASS = 'devicelab-inspect-highlight';

/**
 * Resolve an ElementReference back to a live element within a document.
 *
 * Best-effort only: cross-origin documents, removed elements, and selectors
 * that no longer match resolve to null rather than throwing.
 */
export function resolveElementReference(
  document: Document | null | undefined,
  ref: ElementReference | undefined
): Element | null {
  if (!document || !ref) return null;
  if (ref.selector) {
    try {
      const el = document.querySelector(ref.selector);
      if (el) return el;
    } catch {
      // Invalid selector — fall through to the tag/id fallback below.
    }
  }
  if (ref.id) {
    const byId = document.getElementById(ref.id);
    if (byId) return byId;
  }
  if (ref.tagName) {
    const byTag = document.getElementsByTagName(ref.tagName)[0];
    if (byTag) return byTag;
  }
  return null;
}

/**
 * Highlight the element referenced by a diagnostic, if it can be resolved.
 *
 * - Same-origin only: cross-origin access throws inside a try/catch and
 *   returns null without propagating.
 * - Returns the highlighted element (or null) and never throws.
 * - Only ever queries against the supplied document; no DOM mutation beyond
 *   adding/removing the highlight class.
 */
export function highlightElement(
  document: Document | null | undefined,
  ref: ElementReference | undefined
): Element | null {
  let el: Element | null = null;
  try {
    el = resolveElementReference(document, ref);
  } catch {
    return null;
  }
  if (el) {
    clearHighlight(document);
    el.classList.add(HIGHLIGHT_CLASS);
  }
  return el;
}

/**
 * Remove all previously applied highlights in a document.
 */
export function clearHighlight(document: Document | null | undefined): void {
  if (!document) return;
  try {
    document
      .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
      .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
  } catch {
    // Cross-origin or invalid — nothing to clear.
  }
}

/**
 * Best-effort clear of highlights across a set of iframes, used when the
 * diagnostics panel closes or rescans. Cross-origin frames are skipped.
 */
export function clearAllIframeHighlights(
  getDocument: (id: string) => Document | null | undefined,
  ids: readonly string[]
): void {
  for (const id of ids) {
    clearHighlight(getDocument(id));
  }
}
