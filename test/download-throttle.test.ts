import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CONCURRENCY, PauseGate, RATE_LIMIT_PAUSE_MS, clampConcurrency, clampDownloadDelay } from '../src/shared/download-throttle.ts';
import { sanitizeImportedOptions } from '../src/shared/options-import.ts';

test('F4: concurrency and per-file delay are clamped to safe ranges', () => {
  assert.equal(MAX_CONCURRENCY, 6);
  assert.equal(clampConcurrency(undefined), 3);
  assert.equal(clampConcurrency(0), 1);
  assert.equal(clampConcurrency(6), 6);
  assert.equal(clampConcurrency(10), 6, 'stored values from older builds (up to 10) are capped');
  assert.equal(clampConcurrency(2.6), 3);
  assert.equal(clampConcurrency(Number.NaN), 3);
  assert.equal(clampDownloadDelay(undefined), 0);
  assert.equal(clampDownloadDelay(-5), 0);
  assert.equal(clampDownloadDelay(1_500), 1_500);
  assert.equal(clampDownloadDelay(99_999), 10_000);
});

test('F4: rate-limit pauses from several workers extend to the latest deadline, not their sum', () => {
  const gate = new PauseGate();
  assert.equal(gate.remaining(1_000), 0);
  gate.pause(1_000, RATE_LIMIT_PAUSE_MS);
  gate.pause(2_000, RATE_LIMIT_PAUSE_MS); // second worker hits 429 a second later
  assert.equal(gate.remaining(1_000), RATE_LIMIT_PAUSE_MS + 1_000);
  gate.pause(3_000, 1_000); // a shorter pause never shortens the gate
  assert.equal(gate.remaining(62_000), 0);
  assert.equal(gate.remaining(61_000), 1_000);
});

test('F4: imported settings respect the new throttle bounds', () => {
  const defaults = { concurrency: 3, downloadDelayMs: 0, rateLimitBackoff: true };
  assert.deepEqual(
    sanitizeImportedOptions(defaults, { concurrency: 50, downloadDelayMs: 600_000, rateLimitBackoff: 'no' }),
    { concurrency: 6, downloadDelayMs: 10_000, rateLimitBackoff: true },
  );
});
