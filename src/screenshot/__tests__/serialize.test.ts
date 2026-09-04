import { describe, expect, it } from 'vitest';

import { isValidCaptureSpec, serializeDocumentToXhtml } from '../serialize';

describe('isValidCaptureSpec', () => {
  it('accepts positive finite dimensions', () => {
    expect(isValidCaptureSpec(393, 852)).toBe(true);
  });

  it('rejects zero, negative, and non-finite dimensions', () => {
    expect(isValidCaptureSpec(0, 852)).toBe(false);
    expect(isValidCaptureSpec(393, -1)).toBe(false);
    expect(isValidCaptureSpec(Number.NaN, 852)).toBe(false);
    expect(isValidCaptureSpec(393, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('serializeDocumentToXhtml', () => {
  it('returns empty for null/undefined document', () => {
    expect(serializeDocumentToXhtml(null)).toBe('');
    expect(serializeDocumentToXhtml(undefined)).toBe('');
  });

  it('serializes a plain document to non-empty XHTML', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<h1>Hello</h1>';
    const out = serializeDocumentToXhtml(doc);
    expect(out).toBeTruthy();
    expect(out).toContain('Hello');
  });

  it('removes script, noscript, iframe, and link[rel=import] from the snapshot', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '';
    const script = doc.createElement('script');
    script.textContent = 'alert(1)';
    doc.body.appendChild(script);
    const noscript = doc.createElement('noscript');
    doc.body.appendChild(noscript);
    const iframe = doc.createElement('iframe');
    doc.body.appendChild(iframe);
    const link = doc.createElement('link');
    link.rel = 'import';
    doc.head.appendChild(link);

    const out = serializeDocumentToXhtml(doc);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<noscript');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('<link');
  });

  it('forwards inline stylesheets onto the snapshot', () => {
    const doc = document.implementation.createHTMLDocument('t');
    const style = doc.createElement('style');
    style.textContent = '.a{color:red}';
    doc.head.appendChild(style);
    doc.body.innerHTML = '<div class="a">x</div>';

    const out = serializeDocumentToXhtml(doc);
    expect(out).toContain('color:red');
  });

  it('never mutates the live document', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<div id="keep">x</div>';
    const script = doc.createElement('script');
    script.textContent = 'boom';
    doc.body.appendChild(script);

    serializeDocumentToXhtml(doc);

    // Live DOM is untouched: script still present, content unchanged.
    expect(doc.body.querySelector('script')).not.toBeNull();
    expect(doc.body.innerHTML).toContain('boom');
    expect(doc.body.innerHTML).toContain('keep');
  });

  it('uses the supplied title for the snapshot title', () => {
    const doc = document.implementation.createHTMLDocument('Live Title');
    const out = serializeDocumentToXhtml(doc, 'Device Brand');
    expect(out).toContain('<title>Device Brand</title>');
  });
});
