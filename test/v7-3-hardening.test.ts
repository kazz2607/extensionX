import assert from 'node:assert/strict';
import test from 'node:test';
import { EXTENSION_TO_PAGE, PAGE_TO_EXTENSION, isBridgeHandshake, parseBridgeMessage } from '../src/shared/page-bridge-protocol.ts';
import { isAllowedSender } from '../src/shared/messages.ts';
import { mergeDownloadOptions, retryableDownloadOptions } from '../src/shared/download-options.ts';
import { isValidDownloadOptions } from '../src/shared/validation.ts';
import { sanitizeImportedOptions } from '../src/shared/options-import.ts';
import { createMediaMatcher, localDayEnd, localDayKey, localDayStart } from '../src/shared/media-query.ts';
import { isTelegramDownloadUrl } from '../src/shared/telegram-media.ts';
import { createTimedSettlement } from '../src/shared/timed-settlement.ts';
import type { MediaItem } from '../src/types.ts';
import { routeCollectsMedia } from '../src/content/page-route.ts';

const ORIGIN = 'chrome-extension://abcdefghijklmnop/';

test('bridge messages are typed by direction and reject unknown types', () => {
  assert.deepEqual(parseBridgeMessage({ type: 'X_MEDIA_FOUND', detail: { mediaItems: [] } }, PAGE_TO_EXTENSION), { type: 'X_MEDIA_FOUND', detail: { mediaItems: [] } });
  assert.equal(parseBridgeMessage({ type: 'XMD_FAB_UPDATE', detail: {} }, PAGE_TO_EXTENSION), null, 'page cannot send an extension→page type');
  assert.equal(parseBridgeMessage({ type: 'XMD_FAB_ACTION', detail: {} }, EXTENSION_TO_PAGE), null);
  assert.equal(parseBridgeMessage(['X_MEDIA_FOUND'], PAGE_TO_EXTENSION), null);
  assert.equal(isBridgeHandshake({ __xmdBridge: 'port' }, 'port'), true);
  assert.equal(isBridgeHandshake({ __xmdBridge: 'hello' }, 'port'), false);
});

test('runtime commands are bound to the context that legitimately sends them', () => {
  const page = 'https://x.com/NASA/media';
  assert.equal(isAllowedSender('MEDIA_FOUND', page, ORIGIN), true);
  assert.equal(isAllowedSender('START_DOWNLOAD', page, ORIGIN), true, 'FAB download');
  for (const type of ['START_UNFOLLOW', 'CLEAR_ALL_PROFILE_STORAGE', 'CLEAR_ALL_DOWNLOADED', 'IMPORT_QUEUE', 'SET_JOB_SCHEDULE', 'START_FOLLOWING_SCAN', 'OFFSCREEN_SAVE_BLOB', 'HLS_DONE'] as const) {
    assert.equal(isAllowedSender(type, page, ORIGIN), false, `${type} from a content script`);
  }
  assert.equal(isAllowedSender('START_UNFOLLOW', `${ORIGIN}popup/popup.html`, ORIGIN), true);
  assert.equal(isAllowedSender('OFFSCREEN_SAVE_BLOB', `${ORIGIN}popup/popup.html`, ORIGIN), false);
  assert.equal(isAllowedSender('OFFSCREEN_SAVE_BLOB', `${ORIGIN}offscreen/offscreen.html`, ORIGIN), true);
  assert.equal(isAllowedSender('START_UNFOLLOW', `${ORIGIN}offscreen/offscreen.html`, ORIGIN), false);
  assert.equal(isAllowedSender('GET_QUEUE', undefined, ORIGIN), false);
});

test('START_DOWNLOAD options are allowlisted; internal queue fields never come from callers', () => {
  assert.equal(isValidDownloadOptions({ filterType: 'images', saveFolder: 'x', filenameTemplate: '{tweetId}' }), true);
  assert.equal(isValidDownloadOptions({ _operationId: 'op' }), false);
  assert.equal(isValidDownloadOptions({ _fromQueue: true, _queueId: 'q' }), false);
  assert.equal(isValidDownloadOptions({ unexpected: 1 }), false);
  assert.equal(isValidDownloadOptions({ filenameTemplate: 42 }), false);
  assert.equal(isValidDownloadOptions({ filenameTemplate: 'x'.repeat(201) }), false);
});

test('retry drops queue tracking and Saved Job blanks keep the global folder/template', () => {
  assert.deepEqual(retryableDownloadOptions({ filterType: 'videos', _fromQueue: true, _queueId: 'q', _operationId: 'op' }), { filterType: 'videos' });
  const merged = mergeDownloadOptions({ saveFolder: 'X', filenameTemplate: '{date}', concurrency: 3 }, { saveFolder: '', filenameTemplate: '  ', concurrency: 5, keyword: undefined });
  assert.deepEqual(merged, { saveFolder: 'X', filenameTemplate: '{date}', concurrency: 5 });
  assert.equal(mergeDownloadOptions({ saveFolder: 'X' }, { saveFolder: 'Jobs' }).saveFolder, 'Jobs');
});

test('settings import keeps only known, well-typed and bounded values', () => {
  const defaults = { saveFolder: '', concurrency: 3, autoStop: false, mediaTypes: { images: true, videos: true }, filenameTemplate: '' };
  const imported = sanitizeImportedOptions(defaults, {
    saveFolder: 'Media', concurrency: 999, autoStop: 'yes', injected: true,
    mediaTypes: { images: false, videos: 'no', extra: 1 }, filenameTemplate: 'x'.repeat(300),
  });
  assert.deepEqual(imported, { saveFolder: 'Media', concurrency: 6, autoStop: false, mediaTypes: { images: false, videos: true }, filenameTemplate: '' });
  assert.deepEqual(sanitizeImportedOptions(defaults, 'not an object'), defaults);
});

test('date ranges use local calendar days for every media query', () => {
  const start = localDayStart('2026-01-01');
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(start).getDate(), 1);
  assert.equal(localDayEnd('2026-01-01') - start, 24 * 60 * 60 * 1000 - 1);
  assert.equal(localDayKey(new Date(2026, 0, 1, 0, 30).getTime()), '2026-01-01');
  const item = (tweetDate: number) => ({ url: 'https://pbs.twimg.com/media/a.jpg', type: 'image', tweetDate }) as MediaItem;
  const matches = createMediaMatcher({ dateFrom: '2026-01-01', dateTo: '2026-01-01' });
  assert.equal(matches(item(new Date(2026, 0, 1, 0, 30).getTime())), true, 'just after local midnight');
  assert.equal(matches(item(new Date(2026, 0, 1, 23, 59).getTime())), true);
  assert.equal(matches(item(new Date(2026, 0, 2, 0, 1).getTime())), false, 'next local morning');
});

test('Telegram saves accept only same-origin blob/stream or media data URLs', () => {
  assert.equal(isTelegramDownloadUrl('blob:https://web.telegram.org/0f6c'), true);
  assert.equal(isTelegramDownloadUrl('https://web.telegram.org/a/progressive/document123'), true);
  assert.equal(isTelegramDownloadUrl('data:image/jpeg;base64,AAAA'), true);
  assert.equal(isTelegramDownloadUrl('javascript:alert(1)'), false);
  assert.equal(isTelegramDownloadUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isTelegramDownloadUrl('https://evil.example/a.mp4'), false);
  assert.equal(isTelegramDownloadUrl('blob:https://evil.example/1'), false);
});

test('download timeout is an inactivity timeout: progress keeps a slow download alive', async () => {
  const settlement = createTimedSettlement<number>(40, () => new Error('stalled'));
  const keepAlive = setInterval(() => settlement.touch(), 15);
  await new Promise((resolve) => setTimeout(resolve, 120));
  clearInterval(keepAlive);
  assert.equal(settlement.resolve(7), true, 'touched settlement must still be pending');
  assert.equal(await settlement.promise, 7);
  const stalled = createTimedSettlement<number>(20, () => new Error('stalled'));
  await assert.rejects(stalled.promise, /stalled/);
  stalled.touch(); // no-op after settling
});

test('page scripts only parse media on routes that can collect it', () => {
  for (const path of ['/NASA/media', '/NASA/status/1850000000000000000', '/NASA/likes', '/i/bookmarks']) {
    assert.equal(routeCollectsMedia(`https://x.com${path}`), true, path);
  }
  for (const path of ['/home', '/explore', '/notifications', '/messages/123', '/search', '/i/lists/1', '/']) {
    assert.equal(routeCollectsMedia(`https://x.com${path}`), false, path);
  }
});

test('v7.4.0 theme preference defaults to system and the toggle cycles all three modes', async () => {
  const { nextThemePreference, parseThemePreference, resolveTheme } = await import('../src/shared/theme.ts');
  assert.equal(parseThemePreference(undefined), 'system');
  assert.equal(parseThemePreference('bogus'), 'system');
  assert.equal(parseThemePreference('light'), 'light');
  assert.deepEqual(['system', 'light', 'dark'].map((mode) => nextThemePreference(mode as 'system')), ['light', 'dark', 'system']);
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
});

test('v7.4.0 translations interpolate variables and fall back to English, then the key', async () => {
  const { registerTranslations, t } = await import('../src/lib/i18n.ts');
  registerTranslations({ en: { test_count: '{n} items for {user}', test_only_en: 'English only' }, vi: { test_count: '{n} mục của {user}' } });
  assert.equal(t('test_count', { n: 3, user: 'NASA' }), '3 items for NASA');
  assert.equal(t('test_only_en'), 'English only');
  assert.equal(t('test_missing_key'), 'test_missing_key');
  assert.equal(t('test_count', { n: 1 }), '1 items for {user}', 'unknown placeholders stay visible');
  const { translateFrom } = await import('../src/lib/i18n/content.ts');
  const table = { en: { k: 'Hello {name}' }, vi: { k: 'Xin chào {name}' } };
  assert.equal(translateFrom(table, 'vi', 'k', { name: 'A' }), 'Xin chào A');
  assert.equal(translateFrom(table, 'fr', 'k', { name: 'A' }), 'Hello A');
  assert.equal(translateFrom({ en: { k: 'Only en' }, vi: {} }, 'vi', 'k'), 'Only en');
});
