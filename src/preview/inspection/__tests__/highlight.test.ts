import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ElementReference } from '@/inspection';
import {
  clearAllIframeHighlights,
  clearHighlight,
  HIGHLIGHT_CLASS,
  HIGHLIGHT_STYLE_ID,
  highlightElement,
  resolveElementReference,
} from '../highlight';

afterEach(() => {
  document.body.innerHTML = '';
});

// --- resolveElementReference ---

describe('resolveElementReference', () => {
  function setupDoc(html: string): Document {
    document.body.innerHTML = html;
    return document;
  }

  it('returns null for null document', () => {
    const ref: ElementReference = { tagName: 'div' };
    expect(resolveElementReference(null, ref)).toBeNull();
  });

  it('returns null for undefined ref', () => {
    expect(resolveElementReference(document, undefined)).toBeNull();
  });

  it('resolves via selector', () => {
    const doc = setupDoc('<p id="hello">Hi</p>');
    const ref: ElementReference = { tagName: 'p', selector: '#hello' };
    const el = resolveElementReference(doc, ref);
    expect(el).not.toBeNull();
    expect(el!.id).toBe('hello');
  });

  it('falls back to id when selector fails', () => {
    const doc = setupDoc('<span id="target">X</span>');
    const ref: ElementReference = {
      tagName: 'span',
      selector: '.nonexistent',
      id: 'target',
    };
    const el = resolveElementReference(doc, ref);
    expect(el).not.toBeNull();
    expect(el!.id).toBe('target');
  });

  it('falls back to tag name', () => {
    const doc = setupDoc('<article>Content</article>');
    const ref: ElementReference = { tagName: 'article' };
    const el = resolveElementReference(doc, ref);
    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('ARTICLE');
  });

  it('returns null when nothing matches', () => {
    const doc = setupDoc('<p>Only this</p>');
    const ref: ElementReference = { tagName: 'bogus' };
    expect(resolveElementReference(doc, ref)).toBeNull();
  });
});

// --- highlightElement ---

describe('highlightElement', () => {
  function setupDoc(html: string): Document {
    document.body.innerHTML = html;
    return document;
  }

  it('adds the highlight class to the resolved element', () => {
    const doc = setupDoc('<p id="a">Hello</p>');
    const ref: ElementReference = { tagName: 'p', selector: '#a' };
    highlightElement(doc, ref);
    const el = doc.querySelector('#a');
    expect(el).not.toBeNull();
    expect(el!.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
  });

  it('clears previous highlights before highlighting a new element', () => {
    const doc = setupDoc('<p id="a">Hello</p><p id="b">World</p>');
    const refA: ElementReference = { tagName: 'p', selector: '#a' };
    const refB: ElementReference = { tagName: 'p', selector: '#b' };

    highlightElement(doc, refA);
    expect(doc.querySelector('#a')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      true
    );

    highlightElement(doc, refB);
    expect(doc.querySelector('#a')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      false
    );
    expect(doc.querySelector('#b')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      true
    );
  });

  it('returns null for null document without throwing', () => {
    const ref: ElementReference = { tagName: 'p' };
    expect(highlightElement(null, ref)).toBeNull();
  });

  it('returns null for undefined ref', () => {
    expect(highlightElement(document, undefined)).toBeNull();
  });

  it('returns null when element is not found in document', () => {
    const doc = setupDoc('<p>Only this</p>');
    const ref: ElementReference = { tagName: 'bogus' };
    expect(highlightElement(doc, ref)).toBeNull();
  });

  it('injects the highlight rule into the document (faded highlight would be invisible)', () => {
    const doc = setupDoc('<p id="a">Hello</p>');
    const ref: ElementReference = { tagName: 'p', selector: '#a' };
    highlightElement(doc, ref);
    const style = doc.getElementById(HIGHLIGHT_STYLE_ID);
    expect(style).not.toBeNull();
    expect(style!.tagName).toBe('STYLE');
    expect(style!.textContent).toContain(`.${HIGHLIGHT_CLASS}`);
    expect(style!.textContent).toContain('outline: 3px solid #3b82f6');
  });

  it('is idempotent — repeated highlights do not duplicate the injected rule', () => {
    const doc = setupDoc('<p id="a">Hello</p><p id="b">World</p>');
    const refA: ElementReference = { tagName: 'p', selector: '#a' };
    const refB: ElementReference = { tagName: 'p', selector: '#b' };

    highlightElement(doc, refA);
    highlightElement(doc, refB);
    highlightElement(doc, refB);

    expect(doc.querySelectorAll(`#${HIGHLIGHT_STYLE_ID}`)).toHaveLength(1);
  });
});

// --- clearHighlight ---

describe('clearHighlight', () => {
  it('removes highlight class from all elements', () => {
    document.body.innerHTML = '<p class="other">A</p><p>B</p>';
    const p1 = document.body.children[0]!;
    const p2 = document.body.children[1]!;
    p1.classList.add(HIGHLIGHT_CLASS);
    p2.classList.add(HIGHLIGHT_CLASS);

    clearHighlight(document);
    expect(p1.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    expect(p2.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
  });

  it('removes the injected highlight rule on clear', () => {
    document.body.innerHTML = '<p id="a">A</p>';
    const p1 = document.body.children[0]!;
    p1.classList.add(HIGHLIGHT_CLASS);
    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    document.head?.appendChild(style);

    clearHighlight(document);
    expect(p1.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    expect(document.getElementById(HIGHLIGHT_STYLE_ID)).toBeNull();
  });

  it('does nothing for null document', () => {
    expect(() => clearHighlight(null)).not.toThrow();
  });
});

// --- clearAllIframeHighlights ---

describe('clearAllIframeHighlights', () => {
  it('clears highlights across all provided documents', () => {
    document.body.innerHTML = '<p id="a">A</p><p id="b">B</p>';
    const p1 = document.body.children[0]!;
    const p2 = document.body.children[1]!;
    p1.classList.add(HIGHLIGHT_CLASS);
    p2.classList.add(HIGHLIGHT_CLASS);

    const docGetter = vi.fn(() => document);
    clearAllIframeHighlights(docGetter, ['e1', 'e2']);

    expect(docGetter).toHaveBeenCalledTimes(2);
    expect(p1.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    expect(p2.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
  });

  it('gracefully handles null documents (cross-origin)', () => {
    const docGetter = vi.fn(() => null);
    expect(() => clearAllIframeHighlights(docGetter, ['e1'])).not.toThrow();
  });
});
