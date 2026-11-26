import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { stripVietnamese } from '../scripts/vite-locale-split.mjs';
import { extractMediaFromResponse, GRAPHQL_SKIP_KEYS } from '../src/shared/graphql-media.ts';

test('P21: skipping user_results/card keeps media of tweets, retweets and quoted tweets', () => {
  const photo = (id: string) => ({ type: 'photo', id_str: id, media_key: `3_${id}`, media_url_https: `https://pbs.twimg.com/media/${id}.jpg`, original_info: { width: 10, height: 20 } });
  const tweet = (id: string, extra: Record<string, unknown> = {}) => ({
    rest_id: id,
    core: { user_results: { result: { legacy: { entities: { media: [photo(`avatar${id}`)] } } } } },
    card: { legacy: { entities: { media: [photo(`card${id}`)] } } },
    legacy: { id_str: id, full_text: `t${id}`, favorite_count: 5, extended_entities: { media: [photo(`m${id}`)] } },
    ...extra,
  });
  const payload = {
    data: {
      entries: [
        { tweet_results: { result: tweet('1', { quoted_status_result: { result: tweet('2') } }) } },
        { tweet_results: { result: tweet('3', { legacy: { id_str: '3', retweeted_status_result: { result: tweet('4') } } }) } },
      ],
    },
  };
  const found: Array<{ url: string; tweetId: string; likeCount?: number }> = [];
  extractMediaFromResponse(payload, found);
  assert.deepEqual(found.map((item) => item.url), ['m1', 'm2', 'm4'].map((id) => `https://pbs.twimg.com/media/${id}.jpg`));
  assert.equal(found[0].tweetId, '1');
  assert.equal(found[0].likeCount, 5);

  const everything: Array<{ url: string }> = [];
  extractMediaFromResponse(payload, everything, new Set());
  assert.equal(everything.length, found.length + 8, 'the skipped branches are the only difference');
  assert.deepEqual([...GRAPHQL_SKIP_KEYS].sort(), ['card', 'user_results']);
});

const SPLIT: Record<string, string[]> = {
  'background.ts': ['SHARED_UI_STRINGS', 'BACKGROUND_STRINGS'],
  'common.ts': ['COMMON_STRINGS'],
  'download-center.ts': ['DOWNLOAD_CENTER_STRINGS'],
  'options.ts': ['OPTIONS_STRINGS'],
  'popup.ts': ['POPUP_STRINGS'],
};

test('P26a: the build removes every vi block of the split tables and keeps en', async () => {
  for (const [file, names] of Object.entries(SPLIT)) {
    const source = await readFile(new URL(`../src/lib/i18n/${file}`, import.meta.url), 'utf8');
    const code: string = stripVietnamese(source, names, file);
    assert.doesNotMatch(code, /[ạảấầậắằặếềệịọộớờợụứừựỳ]/, `${file} still carries Vietnamese text`);
    for (const name of names) assert.match(code, new RegExp(`remote: '${name}'`), `${file}: ${name} is not marked remote`);
    assert.equal((code.match(/\n {2}en: \{\n/g) ?? []).length, names.length, `${file}: en blocks must survive`);
  }
});

test('P26a: an unexpected table layout fails the build instead of shipping a broken table', () => {
  assert.throws(() => stripVietnamese('export const X_STRINGS: TranslationTable = {\n  en: {},\n};\n', ['X_STRINGS']), /vi block/);
  assert.throws(() => stripVietnamese('', ['MISSING_STRINGS']), /not found/);
});

test('P26a: Vietnamese tables are fetched on demand; a failed fetch falls back to English and is retried', async () => {
  const requested: string[] = [];
  let fail = true;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: async () => ({ lang: 'vi' }) } },
  };
  globals.fetch = async (url: string) => {
    requested.push(url);
    if (fail) return new Response('', { status: 404 });
    return new Response(JSON.stringify({ p26_hello: 'Xin chào' }));
  };
  const { loadI18n, registerTranslations, setLanguage, t } = await import('../src/lib/i18n.ts');
  registerTranslations({ en: { p26_hello: 'Hello' }, vi: {}, remote: 'P26_STRINGS' });

  await loadI18n();
  assert.equal(t('p26_hello'), 'Hello', 'missing table falls back to English');
  assert.deepEqual(requested, ['chrome-extension://test/i18n/vi/P26_STRINGS.json']);

  fail = false;
  await setLanguage('vi');
  assert.equal(t('p26_hello'), 'Xin chào');
  await setLanguage('en');
  await setLanguage('vi');
  assert.equal(requested.length, 2, 'a loaded table is not fetched again');
  await setLanguage('en');
  assert.equal(t('p26_hello'), 'Hello');
});
