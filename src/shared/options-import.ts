/**
 * Settings import: a user-chosen JSON file must not be able to write arbitrary
 * keys, wrong types or oversized values into chrome.storage.sync. Values are
 * accepted only where the defaults have a field of the same primitive type
 * (recursively for nested groups); everything else falls back to the default.
 */
type Plain = Record<string, unknown>;

const NUMBER_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  concurrency: [1, 6],
  downloadDelayMs: [0, 10_000],
  scrollDelay: [0, 60],
  maxScrolls: [1, 10_000],
  maxMedia: [0, 1_000_000],
  autoStopAfter: [3, 1_000],
  minImageWidth: [0, 20_000],
  minImageHeight: [0, 20_000],
};
const STRING_MAX: Readonly<Record<string, number>> = { filenameTemplate: 200, saveFolder: 500 };
const DEFAULT_STRING_MAX = 100;

function isPlain(value: unknown): value is Plain {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAgainst(defaults: Plain, raw: Plain): Plain {
  const result: Plain = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw[key];
    if (isPlain(fallback)) {
      result[key] = sanitizeAgainst(fallback, isPlain(value) ? value : {});
    } else if (typeof fallback === 'boolean') {
      result[key] = typeof value === 'boolean' ? value : fallback;
    } else if (typeof fallback === 'number') {
      const [min, max] = NUMBER_BOUNDS[key] ?? [0, 1_000_000];
      result[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    } else if (typeof fallback === 'string') {
      result[key] = typeof value === 'string' && value.length <= (STRING_MAX[key] ?? DEFAULT_STRING_MAX) ? value : fallback;
    } else {
      result[key] = fallback;
    }
  }
  return result;
}

export function sanitizeImportedOptions<T extends object>(defaults: T, raw: unknown): T {
  return sanitizeAgainst(defaults as Plain, isPlain(raw) ? raw : {}) as T;
}
