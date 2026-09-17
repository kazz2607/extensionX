export const DIAGNOSTICS_VERSION = 1;
export const MAX_DIAGNOSTIC_EVENTS = 200;
export interface DiagnosticEvent { name: string; at: number; value?: number; code?: string; }
export interface LocalDiagnostics { version: number; updatedAt: number; counters: Record<string, number>; events: DiagnosticEvent[]; }

export function emptyDiagnostics(now = Date.now()): LocalDiagnostics {
  return { version: DIAGNOSTICS_VERSION, updatedAt: now, counters: {}, events: [] };
}

/** Prevent URLs, usernames, tokens and raw exception text from entering exports. */
export function sanitizeDiagnosticCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64);
  return code || undefined;
}

export function addDiagnosticEvent(current: LocalDiagnostics | undefined, name: string, options: { value?: number; code?: unknown; now?: number } = {}): LocalDiagnostics {
  const now = options.now ?? Date.now();
  const base = current?.version === DIAGNOSTICS_VERSION ? current : emptyDiagnostics(now);
  const counters = { ...base.counters, [name]: (base.counters[name] ?? 0) + (options.value ?? 1) };
  const event: DiagnosticEvent = { name, at: now };
  if (typeof options.value === 'number' && Number.isFinite(options.value)) event.value = options.value;
  const code = sanitizeDiagnosticCode(options.code);
  if (code) event.code = code;
  return { version: DIAGNOSTICS_VERSION, updatedAt: now, counters, events: [...base.events, event].slice(-MAX_DIAGNOSTIC_EVENTS) };
}
