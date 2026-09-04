import { describe, expect, it } from 'vitest';

import {
  buildScreenshotFilename,
  formatTimestamp,
  sanitizeFilenamePart,
} from '../filename';

describe('sanitizeFilenamePart', () => {
  it('lowercases and trims', () => {
    expect(sanitizeFilenamePart('  iPhone 15 Pro  ')).toBe('iphone_15_pro');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilenamePart('a/b\\c: d*e?f')).toBe('a_b_c_d_e_f');
  });

  it('collapses repeated underscores', () => {
    expect(sanitizeFilenamePart('weird  name!!!')).toBe('weird_name');
  });

  it('strips leading underscores', () => {
    expect(sanitizeFilenamePart('___lead__in')).toBe('lead_in');
  });

  it('handles empty string', () => {
    expect(sanitizeFilenamePart('')).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('produces file-name-safe ISO-like string', () => {
    const ts = formatTimestamp(new Date('2026-02-26T02:30:00.000Z'));
    // Colons replaced with dashes so the value is safe on Windows.
    expect(ts).toBe('2026-02-26T02-30-00.000Z');
  });
});

describe('buildScreenshotFilename', () => {
  const date = new Date('2026-02-26T02:30:00.000Z');

  it('builds a safe filename without timestamp', () => {
    expect(buildScreenshotFilename('iPhone 15', 393, 852)).toBe(
      'iphone_15_393x852.png'
    );
  });

  it('builds a filename with timestamp when requested', () => {
    expect(
      buildScreenshotFilename('iPhone 15', 393, 852, { timestamp: true, date })
    ).toBe('iphone_15_393x852_2026-02-26T02-30-00.000Z.png');
  });

  it('rounds non-integer dimensions', () => {
    expect(buildScreenshotFilename('Custom', 1024.4, 768.6)).toBe(
      'custom_1024x769.png'
    );
  });
});
