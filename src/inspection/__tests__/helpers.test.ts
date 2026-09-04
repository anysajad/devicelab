import { describe, expect, it } from 'vitest';

import { generateDiagnosticId, buildSimpleSelector } from '../utils';
import { createMockMeasurementAdapter } from './helpers';

describe('generateDiagnosticId', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateDiagnosticId('off-viewport', {
      tagName: 'div',
      id: 'e1',
    });
    const b = generateDiagnosticId('off-viewport', {
      tagName: 'div',
      id: 'e1',
    });
    expect(a).toBe(b);
  });

  it('differs across diagnostic types', () => {
    const a = generateDiagnosticId('off-viewport', { tagName: 'div' });
    const b = generateDiagnosticId('text-overflow', { tagName: 'div' });
    expect(a).not.toBe(b);
  });

  it('differs when element signature changes', () => {
    const a = generateDiagnosticId('off-viewport', { tagName: 'div', id: 'a' });
    const b = generateDiagnosticId('off-viewport', { tagName: 'div', id: 'b' });
    expect(a).not.toBe(b);
  });
});

describe('buildSimpleSelector', () => {
  it('builds tag-based selector', () => {
    expect(buildSimpleSelector('div')).toBe('div');
  });

  it('appends id when present', () => {
    expect(buildSimpleSelector('div', 'header')).toBe('div#header');
  });

  it('appends class names', () => {
    expect(buildSimpleSelector('span', undefined, 'a b c')).toBe('span.a.b.c');
  });
});

describe('createMockMeasurementAdapter', () => {
  function createChild() {
    const child = document.createElement('div');
    document.body.appendChild(child);
    return child;
  }

  it('returns specified rect values', () => {
    const el = createChild();
    const map = new Map();
    map.set(el, {
      rect: { x: 5, y: 10, width: 100, height: 50 },
    });
    const adapter = createMockMeasurementAdapter(map);
    const rect = adapter.getElementRect(el);
    expect(rect.x).toBe(5);
    expect(rect.y).toBe(10);
    expect(rect.width).toBe(100);
    expect(rect.right).toBe(105);
    expect(rect.bottom).toBe(60);
  });

  it('returns default style merged with overrides', () => {
    const el = createChild();
    const map = new Map();
    map.set(el, {
      style: { position: 'fixed' },
    });
    const adapter = createMockMeasurementAdapter(map);
    const style = adapter.getComputedStyle(el);
    expect(style.position).toBe('fixed');
    expect(style.overflowX).toBe('visible');
  });

  it('returns scroll/client dimensions', () => {
    const el = createChild();
    const map = new Map();
    map.set(el, {
      scrollWidth: 300,
      clientWidth: 100,
      scrollHeight: 200,
      clientHeight: 50,
    });
    const adapter = createMockMeasurementAdapter(map);
    expect(adapter.getScrollWidth(el)).toBe(300);
    expect(adapter.getClientDimensions(el)).toEqual({
      clientWidth: 100,
      clientHeight: 50,
    });
  });
});
