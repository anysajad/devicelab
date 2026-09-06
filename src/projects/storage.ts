/**
 * localStorage StorageAdapter implementation.
 *
 * Wraps every operation in try/catch so quota errors, SecurityError,
 * and other storage failures never crash the application.
 */

import type { StorageAdapter } from './types';

/** Key prefix for project records. */
export const PROJECT_KEY_PREFIX = 'devicelab.project.';

/** Key for the last-opened project pointer. */
export const LAST_PROJECT_KEY = 'devicelab.lastProject';

/**
 * Create a StorageAdapter backed by the browser's localStorage.
 *
 * If localStorage is unavailable (SSR, disabled storage, etc.),
 * every method silently returns safe defaults and the adapter
 * degrades to a no-op rather than throwing.
 */
export function createLocalStorageAdapter(storage?: Storage): StorageAdapter {
  // Probe whether localStorage is accessible
  let available = true;
  try {
    const testKey = '__devicelab_probe__';
    (storage ?? localStorage).setItem(testKey, '1');
    (storage ?? localStorage).removeItem(testKey);
  } catch {
    available = false;
  }

  const store = available ? (storage ?? localStorage) : null;

  return {
    getItem(key: string): string | null {
      try {
        return store?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },

    setItem(key: string, value: string): boolean {
      try {
        store?.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },

    removeItem(key: string): void {
      try {
        store?.removeItem(key);
      } catch {
        // Silently ignored
      }
    },

    keys(prefix: string): string[] {
      try {
        if (!store) return [];
        const result: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key !== null && key.startsWith(prefix)) {
            result.push(key);
          }
        }
        return result;
      } catch {
        return [];
      }
    },
  };
}

/**
 * Create an in-memory StorageAdapter for testing.
 */
export function createMemoryAdapter(): StorageAdapter & {
  readonly _data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): boolean {
      data.set(key, value);
      return true;
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    keys(prefix: string): string[] {
      return Array.from(data.keys()).filter((k) => k.startsWith(prefix));
    },
    _data: data,
  };
}
