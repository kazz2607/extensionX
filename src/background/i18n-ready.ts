/**
 * i18n-ready.ts — service-worker translations.
 * An MV3 worker is woken by the very event it must handle, so handlers that
 * produce user-visible text (runtime messages, schedule alarms) wait for the
 * stored language first; otherwise a Vietnamese user's notification created
 * right after a wake-up would be stored in English for good.
 */
import { loadI18n, registerTranslations } from '../lib/i18n.ts';
import { BACKGROUND_STRINGS, SHARED_UI_STRINGS } from '../lib/i18n/background.ts';

registerTranslations(BACKGROUND_STRINGS, SHARED_UI_STRINGS);

let settled = false;
export const i18nReady: Promise<void> = loadI18n().catch(() => {}).finally(() => { settled = true; });

export function isI18nReady(): boolean {
  return settled;
}

// Follow language changes made in Options while the worker is alive.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'lang' in changes) void loadI18n();
});
