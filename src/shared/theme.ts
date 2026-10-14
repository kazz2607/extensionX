/**
 * theme.ts — one theme preference for every extension page.
 * The stored preference is 'system' | 'light' | 'dark' (default 'system');
 * <html data-theme> always holds the resolved 'light' | 'dark' value.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function parseThemePreference(value: unknown): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference) ? value as ThemePreference : 'system';
}

/** The header toggle cycles system → light → dark → system. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  return PREFERENCES[(PREFERENCES.indexOf(current) + 1) % PREFERENCES.length];
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

let currentPreference: ThemePreference = 'system';
let mediaListenerAdded = false;
const listeners = new Set<(preference: ThemePreference) => void>();

/** Notified when the preference changes in another page (popup ↔ Options). */
export function onThemeChange(listener: (preference: ThemePreference) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function render(): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', resolveTheme(currentPreference, prefersDark));
  document.documentElement.setAttribute('data-theme-preference', currentPreference);
}

export function getThemePreference(): ThemePreference {
  return currentPreference;
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  currentPreference = preference;
  render();
  await chrome.storage.local.set({ theme: preference }).catch(() => {});
}

/** Read the stored preference, apply it and follow OS changes while on 'system'. */
export async function initTheme(): Promise<ThemePreference> {
  const stored = await chrome.storage.local.get('theme').catch(() => ({})) as { theme?: unknown };
  currentPreference = parseThemePreference(stored.theme);
  render();
  if (!mediaListenerAdded) {
    mediaListenerAdded = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentPreference === 'system') render();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.theme) {
        currentPreference = parseThemePreference(changes.theme.newValue);
        render();
        listeners.forEach((listener) => listener(currentPreference));
      }
    });
  }
  return currentPreference;
}
