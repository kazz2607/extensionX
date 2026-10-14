import { addDiagnosticEvent, emptyDiagnostics, type LocalDiagnostics } from '../shared/diagnostics.ts';
import type { Options } from '../types.ts';
import { chromeApi } from './chrome-api.ts';

const storageKey = 'local_diagnostics_v1';
let writeChain = Promise.resolve();

// Cached opt-in flag: reading storage.sync for every metric was a storage
// round trip per DOM mutation batch even with diagnostics off (the default).
let enabledCache: Promise<boolean> | null = null;
function isEnabled(): Promise<boolean> {
  enabledCache ??= chromeApi.storage.sync.get('options')
    .then((stored) => (stored.options as Options | undefined)?.localDiagnostics === true)
    .catch(() => { enabledCache = null; return false; });
  return enabledCache;
}
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.options) enabledCache = null;
  });
}

export async function recordDiagnostic(name: string, value?: number, code?: string): Promise<void> {
  try {
    if (!(await isEnabled())) return;
    writeChain = writeChain.then(async () => {
      const stored = await chromeApi.storage.local.get(storageKey);
      const current = stored[storageKey] as LocalDiagnostics | undefined;
      await chromeApi.storage.local.set({ [storageKey]: addDiagnosticEvent(current, name, { value, code }) });
    });
    await writeChain;
  } catch {
    // Diagnostics must never affect collection or downloading.
  }
}

export async function exportLocalDiagnostics(): Promise<LocalDiagnostics> {
  const stored = await chromeApi.storage.local.get(storageKey);
  return (stored[storageKey] as LocalDiagnostics | undefined) ?? emptyDiagnostics();
}

export async function clearLocalDiagnostics(): Promise<void> { await chromeApi.storage.local.remove(storageKey); }
