import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'devicelab:theme';

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Resolve a theme preference into an actual dark/light mode. 'system' follows
 * the OS prefers-color-scheme; falls back to light when matchMedia is
 * unavailable (e.g. non-browser test environments).
 */
export function resolveThemePreference(
  pref: ThemePreference
): 'light' | 'dark' {
  if (pref === 'system') {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  }
  return pref;
}

/**
 * Toggle the `dark` class on <html> so the existing Tailwind `dark:`
 * variants activate. There is deliberately no `color-scheme` styling split
 * beyond this — the app already ships dual-palette classes.
 */
export function applyTheme(pref: ThemePreference): void {
  const resolved = resolveThemePreference(pref);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

interface AppState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage may be unavailable; the in-memory preference still applies
    }
    applyTheme(theme);
    set({ theme });
  },
}));
