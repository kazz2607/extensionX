import { addDiagnosticEvent, emptyDiagnostics, type LocalDiagnostics } from '../shared/diagnostics.ts';
import type { Options } from '../types.ts';

const storageKey = 'local_diagnostics_v1';
let writeChain = Promise.resolve();

async function isEnabled(): Promise<boolean> {
  const stored = await chrome.storage.sync.get('options');
  return (stored.options as Options | undefined)?.localDiagnostics === true;
}

export async function recordDiagnostic(name: string, value?: number, code?: string): Promise<void> {
  try {
    if (!(await isEnabled())) return;
    writeChain = writeChain.then(async () => {
      const stored = await chrome.storage.local.get(storageKey);
      const current = stored[storageKey] as LocalDiagnostics | undefined;
      await chrome.storage.local.set({ [storageKey]: addDiagnosticEvent(current, name, { value, code }) });
    });
    await writeChain;
  } catch {
    // Diagnostics must never affect collection or downloading.
  }
}

export async function exportLocalDiagnostics(): Promise<LocalDiagnostics> {
  const stored = await chrome.storage.local.get(storageKey);
  return (stored[storageKey] as LocalDiagnostics | undefined) ?? emptyDiagnostics();
}

export async function clearLocalDiagnostics(): Promise<void> { await chrome.storage.local.remove(storageKey); }
