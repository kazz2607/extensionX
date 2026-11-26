import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EN_SPLIT_TABLES, stripLocales } from '../scripts/vite-locale-split.mjs';

test('9.0.1: the service-worker-only table also leaves its English half out of the bundle', async () => {
  const source = await readFile(new URL('../src/lib/i18n/background.ts', import.meta.url), 'utf8');
  const code: string = stripLocales(source, ['SHARED_UI_STRINGS', 'BACKGROUND_STRINGS'], 'background.ts');
  assert.deepEqual([...EN_SPLIT_TABLES], ['BACKGROUND_STRINGS']);
  const background = code.slice(code.indexOf('export const BACKGROUND_STRINGS'));
  assert.match(background, /\n {2}en: \{\},\n {2}remoteEn: true,/);
  assert.match(background, /\n {2}vi: \{\},\n {2}remote: 'BACKGROUND_STRINGS',/);
  assert.doesNotMatch(background, /bg_err_/, 'no BACKGROUND_STRINGS text left in the bundle');
  // SHARED_UI_STRINGS is also used by the popup and Download Center: English stays inline.
  const shared = code.slice(code.indexOf('export const SHARED_UI_STRINGS'), code.indexOf('export const BACKGROUND_STRINGS'));
  assert.match(shared, /shared_err_cancelled: 'Cancelled by user'/);
});

test('9.0.1: remote English tables are fetched whatever the language, Vietnamese only for vi', async () => {
  const requested: string[] = [];
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: async () => ({}) } },
  };
  globals.fetch = async (url: string) => {
    requested.push(url.replace('chrome-extension://test/', ''));
    return new Response(JSON.stringify(url.includes('/en/') ? { bg_hello: 'Hello' } : { bg_hello: 'Xin chào' }));
  };
  const { loadI18n, registerTranslations, setLanguage, t } = await import('../src/lib/i18n.ts');
  registerTranslations({ en: {}, vi: {}, remote: 'BG_STRINGS', remoteEn: true });

  assert.equal(t('bg_hello'), 'bg_hello', 'nothing before the language is set');
  await loadI18n(); // no stored language: English
  assert.equal(t('bg_hello'), 'Hello');
  assert.deepEqual(requested, ['i18n/en/BG_STRINGS.json']);

  await setLanguage('vi');
  assert.equal(t('bg_hello'), 'Xin chào');
  await setLanguage('en');
  assert.deepEqual(requested, ['i18n/en/BG_STRINGS.json', 'i18n/vi/BG_STRINGS.json'], 'each table is fetched once');

  // A table registered after the language was set is fetched right away.
  registerTranslations({ en: {}, vi: {}, remote: 'LATE_STRINGS', remoteEn: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(requested.includes('i18n/en/LATE_STRINGS.json'));
});
