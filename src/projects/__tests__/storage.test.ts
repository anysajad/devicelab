import { describe, expect, it } from 'vitest';

import { createMemoryAdapter } from '../storage';

describe('createMemoryAdapter', () => {
  it('returns null for missing key', () => {
    const adapter = createMemoryAdapter();
    expect(adapter.getItem('nonexistent')).toBeNull();
  });

  it('stores and retrieves values', () => {
    const adapter = createMemoryAdapter();
    adapter.setItem('key', 'value');
    expect(adapter.getItem('key')).toBe('value');
  });

  it('overwrites existing values', () => {
    const adapter = createMemoryAdapter();
    adapter.setItem('key', 'v1');
    adapter.setItem('key', 'v2');
    expect(adapter.getItem('key')).toBe('v2');
  });

  it('removes values', () => {
    const adapter = createMemoryAdapter();
    adapter.setItem('key', 'value');
    adapter.removeItem('key');
    expect(adapter.getItem('key')).toBeNull();
  });

  it('remove on missing key is a no-op', () => {
    const adapter = createMemoryAdapter();
    expect(() => adapter.removeItem('nonexistent')).not.toThrow();
  });

  it('lists keys with prefix', () => {
    const adapter = createMemoryAdapter();
    adapter.setItem('proj.a', '1');
    adapter.setItem('proj.b', '2');
    adapter.setItem('other.c', '3');
    expect(adapter.keys('proj.')).toEqual(['proj.a', 'proj.b']);
  });

  it('returns empty list when no keys match prefix', () => {
    const adapter = createMemoryAdapter();
    adapter.setItem('a', '1');
    expect(adapter.keys('nonexistent.')).toEqual([]);
  });

  it('handles empty storage', () => {
    const adapter = createMemoryAdapter();
    expect(adapter.keys('')).toEqual([]);
  });
});
