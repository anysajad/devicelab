import { useAppStore } from '@/store/useAppStore';
import type { ThemePreference } from '@/store/useAppStore';

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Accessible color-theme control. Persists the preference via the app store;
 * the `dark` class is applied to <html> by applyTheme().
 */
export function ThemeControl() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
      <svg
        className="h-3.5 w-3.5 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
      <span className="sr-only">Color theme</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        aria-label="Color theme"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
