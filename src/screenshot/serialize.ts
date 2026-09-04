/**
 * Serialization helpers for the best-effort same-origin renderer.
 *
 * These functions work on a DETACHED clone of the iframe document — they never
 * touch the live preview document, so capture is non-mutating by construction.
 *
 * Fidelity is best-effort: the serialized snapshot is an approximation made at
 * capture time and does not reproduce every CSS feature, external resource,
 * font, image, pseudo-element, animation, or browser rendering behavior.
 */

/** Minimum dimensions the renderer refuses to capture (<= 0). */
export const MIN_CAPTURE_DIMENSION = 1;

/**
 * Produce an XHTML string suitable for an SVG `<foreignObject>`.
 *
 * - Clones the live document into a detached document (no live mutation).
 * - Removes `script`/`noscript`/`link[rel=import]` nodes that must not run or
 *   would re-fetch, and removes iframes (unreliable).
 * - Copies the live document's stylesheets that are same-origin-addressable
 *   (`<link rel="stylesheet">` and inline `<style>`) onto the detached clone
 *   so the snapshot has a chance of matching layout.
 * - Takes an optional `title` so the snapshot is identifiable.
 *
 * Exposed as a pure function over (document, title) for unit testing; actual
 * cloning of a live document happens in the caller's capture path.
 */
export function serializeDocumentToXhtml(
  doc: Document | null | undefined,
  title?: string
): string {
  if (!doc) return '';

  const clone = doc.cloneNode(true) as Document;
  const html = clone.documentElement;

  if (html) {
    // Title: prefer an explicit override, then the live title.
    const liveTitle = doc.title;
    let titleEl = clone.querySelector('title');
    if (!titleEl) {
      titleEl = clone.createElement('title');
      html.prepend(titleEl);
    }
    titleEl.textContent = (title ?? '').trim() !== '' ? title! : liveTitle;

    // Remove tags that would attempt to execute or block rendering badly.
    clone
      .querySelectorAll('script, noscript, iframe, link[rel="import"]')
      .forEach((el) => el.remove());
  }

  // Forward relevant stylesheets from the live document onto the clone.
  // Best-effort: cross-origin/inaccessible stylesheets are skipped.
  try {
    const liveSheets = doc.styleSheets;
    for (let i = 0; i < liveSheets.length; i++) {
      const sheet = liveSheets[i];
      if (!sheet) continue;
      if (sheet.href && sheet.href.startsWith('blob:')) continue;
      if (tryCopyStyleSheetInto(clone, sheet)) {
        // copied via link or style already
      }
    }
  } catch {
    // Never let style forwarding break capture; the snapshot may be unstyled.
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  // A bare empty serialization is not a useful snapshot.
  return serialized.trim();
}

function tryCopyStyleSheetInto(
  target: Document,
  sheet: CSSStyleSheet
): boolean {
  try {
    const rules = sheet.cssRules;
    if (rules && rules.length > 0) {
      const style = target.createElement('style');
      let text = '';
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r];
        if (rule) {
          text += rule.cssText + '\n';
        }
      }
      style.textContent = text;
      target.head?.appendChild(style);
      return true;
    }
  } catch {
    // Cross-origin CSSOM access throws — style is skipped.
  }
  return false;
}

/** Validate a screenshot spec is capturable. */
export function isValidCaptureSpec(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= MIN_CAPTURE_DIMENSION &&
    height >= MIN_CAPTURE_DIMENSION
  );
}
