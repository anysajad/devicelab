import type {
  ComputedStyleSnapshot,
  ElementReference,
  MeasurementAdapter,
} from './types';

// --- Tags to skip during DOM traversal ---

const SKIP_TAGS = new Set([
  'HTML',
  'HEAD',
  'BODY',
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'NOSCRIPT',
  'META',
  'LINK',
  'TITLE',
  'BR',
  'HR',
  'WBR',
]);

// --- FNV-1a hash for deterministic IDs ---

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function fnv1a(str: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function toHex(n: number): string {
  return n.toString(16).padStart(8, '0');
}

/**
 * Generate a deterministic diagnostic ID from type + element signature +
 * relevant metadata. Same inputs produce the same ID.
 */
export function generateDiagnosticId(
  type: string,
  element?: ElementReference,
  metadata?: Record<string, unknown>
): string {
  const parts = [type];
  if (element?.tagName) parts.push(element.tagName);
  if (element?.id) parts.push(`id:${element.id}`);
  if (element?.selector) parts.push(`sel:${element.selector}`);
  if (metadata) {
    const keys = Object.keys(metadata).sort();
    for (const k of keys) {
      const v = metadata[k];
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        parts.push(`${k}:${String(v)}`);
      }
    }
  }
  return toHex(fnv1a(parts.join('|')));
}

// --- DOM traversal helpers ---

/** Get all elements eligible for inspection, excluding non-visual tags. */
export function getInspectableElements(doc: Document): Element[] {
  const all = doc.querySelectorAll('*');
  const result: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (!SKIP_TAGS.has(el.tagName)) {
      result.push(el);
    }
  }
  return result;
}

/** Maximum number of inspectable elements before performance warning. */
export const MAX_ELEMENTS = 5000;

// --- Element reference creation ---

/**
 * Build a simple CSS selector from tag, id, and className.
 * Not a robust nth-child selector — just lightweight identification.
 */
export function buildSimpleSelector(
  tag: string,
  id?: string,
  className?: string
): string {
  let sel = tag;
  if (id) sel += `#${id}`;
  if (className) {
    const classes = className.split(/\s+/).filter(Boolean).slice(0, 3);
    if (classes.length > 0) sel += `.${classes.join('.')}`;
  }
  return sel;
}

/** Create a lightweight ElementReference from a DOM Element. */
export function createElementReference(el: Element): ElementReference {
  const tag = el.tagName.toLowerCase();
  const id = el.id || undefined;
  const rawClass = typeof el.className === 'string' ? el.className : '';
  const cls =
    rawClass.length > 0
      ? rawClass.split(/\s+/).filter(Boolean).slice(0, 3).join(' ')
      : undefined;
  const rawText = el.textContent ?? '';
  const trimmed = rawText.slice(0, 80).trim();
  const text = trimmed.length > 0 ? trimmed : undefined;
  const selector = buildSimpleSelector(tag, id, cls);
  return { selector, tagName: tag, id, className: cls, text };
}

// --- Geometry helpers ---

/** Get the bounding rect via the measurement adapter. */
export function getElementRect(el: Element, m: MeasurementAdapter): DOMRect {
  return m.getElementRect(el);
}

/** Get a computed style snapshot via the measurement adapter. */
export function getStyle(
  el: Element,
  m: MeasurementAdapter
): ComputedStyleSnapshot {
  return m.getComputedStyle(el);
}

/** Get overflow metrics for an element. */
export function getOverflowMetrics(
  el: Element,
  m: MeasurementAdapter
): {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
} {
  return {
    scrollWidth: m.getScrollWidth(el),
    clientWidth: m.getClientDimensions(el).clientWidth,
    scrollHeight: m.getScrollHeight(el),
    clientHeight: m.getClientDimensions(el).clientHeight,
  };
}

/** Calculate the area of intersection between two rectangles. Returns 0 if no overlap. */
export function intersectionArea(a: DOMRect, b: DOMRect): number {
  const x = Math.max(a.left, b.left);
  const y = Math.max(a.top, b.top);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  if (x2 <= x || y2 <= y) return 0;
  return (x2 - x) * (y2 - y);
}

/** Check if two rectangles overlap. */
export function rectsOverlap(a: DOMRect, b: DOMRect, minArea = 0): boolean {
  return intersectionArea(a, b) > minArea;
}

// --- Exclusion helpers ---

/** Tags that are non-visual and should be excluded from most checks. */
const NON_VISUAL_TAGS = new Set([
  'HTML',
  'HEAD',
  'BODY',
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'NOSCRIPT',
  'META',
  'LINK',
  'TITLE',
  'BR',
  'HR',
  'WBR',
]);

/** Check if an element is a non-visual tag. */
export function isNonVisualTag(el: Element): boolean {
  return NON_VISUAL_TAGS.has(el.tagName);
}

/** Check if an element has zero area. */
export function hasZeroArea(rect: DOMRect): boolean {
  return rect.width === 0 && rect.height === 0;
}

/** Check if an element is very tiny (< 2x2). */
export function isTinyElement(rect: DOMRect): boolean {
  return rect.width < 2 || rect.height < 2;
}

/** Check if an element is display:none or visibility:hidden. */
export function isHidden(style: ComputedStyleSnapshot): boolean {
  return style.display === 'none' || style.visibility === 'hidden';
}

/** Check if an element has fixed or sticky positioning. */
export function isFixedOrSticky(style: ComputedStyleSnapshot): boolean {
  return style.position === 'fixed' || style.position === 'sticky';
}

/** Check if an element is a scrollable container. */
export function isScrollable(style: ComputedStyleSnapshot): boolean {
  return (
    style.overflowX === 'auto' ||
    style.overflowX === 'scroll' ||
    style.overflowY === 'auto' ||
    style.overflowY === 'scroll'
  );
}

/** Check if text-overflow is set to ellipsis (explicit truncation). */
export function hasEllipsisTruncation(style: ComputedStyleSnapshot): boolean {
  return style.textOverflow === 'ellipsis';
}

/** Check if an element has non-whitespace text content. */
export function hasTextContent(el: Element): boolean {
  const text = el.textContent ?? '';
  return text.trim().length > 0;
}

// --- Content candidate selectors for fixed/sticky overlap ---

const CONTENT_SELECTOR =
  'main, article, section, p, h1, h2, h3, h4, h5, h6, a, img, table, form, [role="main"], [role="article"], [role="content"]';

/** Get elements that represent meaningful page content. */
export function getContentCandidates(
  doc: Document,
  maxCount: number
): Element[] {
  const all = doc.querySelectorAll(CONTENT_SELECTOR);
  const result: Element[] = [];
  for (let i = 0; i < Math.min(all.length, maxCount); i++) {
    result.push(all[i]!);
  }
  return result;
}

/** Check if element `child` is a descendant of element `ancestor`. */
export function isDescendantOf(child: Element, ancestor: Element): boolean {
  let node: Element | null = child;
  while (node) {
    if (node === ancestor) return true;
    node = node.parentElement;
  }
  return false;
}
