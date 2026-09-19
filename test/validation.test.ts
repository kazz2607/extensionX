import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTrustedMediaUrl,
  isValidDownloadOptions,
  isXProfileUrlForUsername,
  isValidMediaItem,
  isValidUsername,
  normalizeMediaUrlToOrig,
  normalizeUrlForDedup,
  parseQueueItems,
  sanitizeFilename,
  sanitizeFolderPath,
} from '../src/shared/validation.ts';
import { formatDownloadError } from '../src/shared/download-errors.ts';
import { parseExtensionMessage } from '../src/shared/messages.ts';
import { addDiagnosticEvent, emptyDiagnostics } from '../src/shared/diagnostics.ts';
import { filterMediaItems } from '../src/shared/media-filter.ts';
import { canTransitionCollectPhase } from '../src/shared/collect-state.ts';
import { recoverQueueItemAfterRestart, transitionQueueItem, wasInterrupted, findInterruptedIds } from '../src/shared/queue-state.ts';
import { renderFilenameTemplate } from '../src/shared/filename-template.ts';
import {
  isTelegramStreamUrl,
  isTelegramWebUrl,
  parseContentRange,
  streamFileExtension,
  telegramMediaFilename,
} from '../src/shared/telegram-media.ts';

test('accepts only known X media origins', () => {
  assert.equal(isTrustedMediaUrl('https://pbs.twimg.com/media/photo.jpg?name=orig'), true);
  assert.equal(isTrustedMediaUrl('https://video.twimg.com/ext_tw_video/123/pu/pl/a.m3u8'), true);
  assert.equal(isTrustedMediaUrl('https://pbs.twimg.com.evil.test/media/a.jpg'), false);
  assert.equal(isTrustedMediaUrl('data:text/html,hello'), false);
});

test('binds profile messages to the X tab URL and rejects malformed envelopes', () => {
  assert.equal(isXProfileUrlForUsername('https://x.com/NASA/media', 'NASA'), true);
  assert.equal(isXProfileUrlForUsername('https://x.com/NASA/likes', 'NASA_likes'), true);
  assert.equal(isXProfileUrlForUsername('https://x.com/other/media', 'NASA'), false);
  assert.equal(isXProfileUrlForUsername('https://x.com.evil.test/NASA/media', 'NASA'), false);
  assert.equal(parseExtensionMessage({ type: 'MEDIA_FOUND', payload: { username: 'NASA' } })?.type, 'MEDIA_FOUND');
  assert.equal(parseExtensionMessage({ type: 'UNRECOGNIZED_COMMAND', payload: {} }), null);
  assert.equal(parseExtensionMessage({ type: 'bad-type!', payload: {} }), null);
  assert.equal(parseExtensionMessage({ type: 'MEDIA_FOUND', payload: 'not-an-object' }), null);
  assert.equal(parseExtensionMessage({ type: 'MEDIA_FOUND', payload: { data: 'x'.repeat(256_000) } }), null);
});

test('validates media items and profile identifiers', () => {
  assert.equal(isValidUsername('NASA'), true);
  assert.equal(isValidUsername('_bookmarks_'), true);
  assert.equal(isValidUsername('../../evil'), false);
  assert.equal(isValidMediaItem({ type: 'image', url: 'https://pbs.twimg.com/media/a.jpg', tweetId: '1234567890', ext: 'jpg' }), true);
  assert.equal(isValidMediaItem({ type: 'image', url: 'https://evil.test/a.jpg' }), false);
  assert.equal(isValidMediaItem({ type: 'image', url: 'https://pbs.twimg.com/media/a.jpg', tweetText: 'x'.repeat(10_001) }), false);
  assert.equal(isValidMediaItem({ type: 'video_placeholder', tweetId: 'not-an-id' }), false);
});

test('bounds download options before they enter the scheduler', () => {
  assert.equal(isValidDownloadOptions({ filterType: 'images', concurrency: 3, keyword: 'space' }), true);
  assert.equal(isValidDownloadOptions({ concurrency: 99 }), false);
  assert.equal(isValidDownloadOptions({ keyword: 'x'.repeat(1_001) }), false);
  assert.equal(isValidDownloadOptions([]), false);
});

test('bounds Download Picker selectedUrls to a trusted, size-capped array', () => {
  assert.equal(isValidDownloadOptions({ selectedUrls: ['https://pbs.twimg.com/media/a.jpg', 'https://video.twimg.com/a.mp4'] }), true);
  assert.equal(isValidDownloadOptions({ selectedUrls: [] }), true);
  assert.equal(isValidDownloadOptions({ selectedUrls: 'https://pbs.twimg.com/media/a.jpg' }), false);
  assert.equal(isValidDownloadOptions({ selectedUrls: Array.from({ length: 2_001 }, () => 'https://pbs.twimg.com/media/a.jpg') }), false);
  assert.equal(isValidDownloadOptions({ selectedUrls: ['https://evil.test/a.jpg'] }), false);
});

test('normalizes folder and filename segments without traversal', () => {
  assert.equal(sanitizeFolderPath('../../Downloads//  profile  /images'), '_/_/Downloads/profile/images');
  assert.equal(sanitizeFolderPath('one\\two/../three'), 'one/two/_/three');
  assert.equal(sanitizeFilename('../unsafe:name?.jpg'), '_unsafe_name_.jpg');
});

test('rejects malformed or oversized queue imports atomically', () => {
  const valid = [{
    id: 'NASA_123', username: 'NASA', filterType: 'all', skipDuplicates: true,
    addedAt: Date.now(), status: 'waiting', mediaCount: 12, result: null,
  }];
  assert.equal(parseQueueItems(valid)?.length, 1);
  assert.equal(parseQueueItems([{ ...valid[0], username: '../../evil' }]), null);
  assert.equal(parseQueueItems([...valid, valid[0]]), null);
  // Pha 12: paused field phải là boolean nếu có mặt
  assert.equal(parseQueueItems([{ ...valid[0], paused: true }])?.[0]?.paused, true);
  assert.equal(parseQueueItems([{ ...valid[0], paused: 'yes' }]), null);
});

test('redacts raw download errors before they reach UI', () => {
  assert.equal(formatDownloadError(new Error('Batch timeout: https://video.twimg.com/a?token=secret')), 'Hết thời gian chờ tải xuống');
  assert.equal(formatDownloadError(new Error('Segment HTTP 403: https://video.twimg.com/a?token=secret')), 'Máy chủ trả về lỗi HTTP 403');
  assert.equal(formatDownloadError(new Error('unknown internal failure https://x.com/?ct0=secret')), 'Không thể tải tệp này');
});

test('keeps diagnostic exports aggregated and redacted', () => {
  const result = addDiagnosticEvent(emptyDiagnostics(1), 'hls.failed', { code: 'HTTP 403 https://video.twimg.com/?token=secret', now: 2 });
  assert.equal(result.counters['hls.failed'], 1);
  assert.equal(result.events[0].code, 'HTTP_403_https___video.twimg.com__token_secret');
  assert.equal(JSON.stringify(result).includes('https://video.twimg.com/?token=secret'), false);
});

test('applies media filters and max media deterministically', () => {
  const items = [
    { type: 'image' as const, url: 'https://pbs.twimg.com/media/a.jpg', width: 200, height: 200 },
    { type: 'image' as const, url: 'https://pbs.twimg.com/card_img/a.jpg', width: 200, height: 200 },
    { type: 'video' as const, url: 'https://video.twimg.com/a.mp4' },
  ];
  assert.deepEqual(filterMediaItems(items, { smartFilters: { filterCardImages: true }, maxMedia: 2 }, 1).map((item) => item.type), ['image']);
});

test('collector state transitions cannot return from a stopped operation without restart', () => {
  assert.equal(canTransitionCollectPhase('idle', 'starting'), true);
  assert.equal(canTransitionCollectPhase('collecting', 'failed'), true);
  assert.equal(canTransitionCollectPhase('stopped', 'collecting'), false);
});

test('queue recovery resets interrupted work but rejects invalid terminal transitions', () => {
  const item = { id: 'NASA_1', username: 'NASA', filterType: 'all', skipDuplicates: true, addedAt: 1, status: 'downloading' as const, mediaCount: 1 };
  assert.equal(recoverQueueItemAfterRestart(item).status, 'waiting');
  assert.equal(transitionQueueItem({ ...item, status: 'done' }, 'waiting'), null);
});

test('flags only downloading queue items as interrupted (Pha 10 resume dedup signal)', () => {
  const base = { id: 'NASA_1', username: 'NASA', filterType: 'all', skipDuplicates: false, addedAt: 1, mediaCount: 1 };
  assert.equal(wasInterrupted({ ...base, status: 'downloading' }), true);
  assert.equal(wasInterrupted({ ...base, status: 'waiting' }), false);
  assert.equal(wasInterrupted({ ...base, status: 'done' }), false);
  assert.equal(wasInterrupted({ ...base, status: 'error' }), false);
});

test('finds interrupted ids from raw import data before parseQueueItems normalizes status (Pha 10 bugfix)', () => {
  const raw = [
    { id: 'A', status: 'downloading' },
    { id: 'B', status: 'waiting' },
    { id: 'C', status: 'downloading' },
    { notAnObject: true },
    null,
  ];
  assert.deepEqual(findInterruptedIds(raw), new Set(['A', 'C']));
  assert.deepEqual(findInterruptedIds('not-an-array'), new Set());
  assert.deepEqual(findInterruptedIds(undefined), new Set());
});

test('renders filename template tokens without touching unknown text (Pha 13)', () => {
  const ctx = { username: 'NASA', tweetId: '123', date: '2026-09-18', type: 'image', ext: 'jpg', index: 3 };
  assert.equal(renderFilenameTemplate('{username}_{tweetId}_{date}.{ext}', ctx), 'NASA_123_2026-09-18.jpg');
  assert.equal(renderFilenameTemplate('{index}-{index}', ctx), '3-3');
  assert.equal(renderFilenameTemplate('{type}/{username}', ctx), 'image/NASA');
  assert.equal(renderFilenameTemplate('plain-no-tokens', ctx), 'plain-no-tokens');
  assert.equal(renderFilenameTemplate('', ctx), '');
  assert.equal(renderFilenameTemplate('{unknown}_{username}', ctx), '{unknown}_NASA');
});

test('normalizes media URLs for dedup and forces video URLs to original quality', () => {
  assert.equal(
    normalizeUrlForDedup('https://pbs.twimg.com/media/a.jpg?name=orig&t=12345'),
    'https://pbs.twimg.com/media/a.jpg?name=orig&format=',
  );
  assert.equal(
    normalizeUrlForDedup('https://pbs.twimg.com/media/a.jpg?format=jpg&t=99'),
    'https://pbs.twimg.com/media/a.jpg?name=&format=jpg',
  );
  assert.equal(normalizeUrlForDedup('https://video.twimg.com/a.mp4?t=1'), 'https://video.twimg.com/a.mp4');
  assert.equal(normalizeUrlForDedup('not a url?foo=bar'), 'not a url');

  assert.equal(normalizeMediaUrlToOrig('https://video.twimg.com/a.mp4?name=small'), 'https://video.twimg.com/a.mp4?name=orig');
  assert.equal(normalizeMediaUrlToOrig('https://video.twimg.com/a.mp4?name=orig'), 'https://video.twimg.com/a.mp4?name=orig');
  assert.equal(normalizeMediaUrlToOrig('https://video.twimg.com/a.mp4'), 'https://video.twimg.com/a.mp4');
});

test('validates Telegram senders and preserves known media extensions', () => {
  assert.equal(isTelegramWebUrl('https://web.telegram.org/k/'), true);
  assert.equal(isTelegramWebUrl('https://web.telegram.org.evil.test/k/'), false);
  assert.equal(isTelegramWebUrl('http://web.telegram.org/k/'), false);
  assert.equal(telegramMediaFilename('image', 'https://cdn.test/photo.webp', '', 123), 'telegram_image_123.webp');
  assert.equal(telegramMediaFilename('video', 'blob:https://web.telegram.org/id', 'video/webm', 456), 'telegram_video_456.webm');
  assert.equal(telegramMediaFilename('image', 'data:image/png;base64,abc', 'image/png', 789), 'telegram_image_789.png');
});

test('recognizes Telegram Service Worker stream URLs and parses Range responses', () => {
  assert.equal(isTelegramStreamUrl('https://web.telegram.org/k/stream/%7B%22dcId%22%3A4%7D'), true);
  assert.equal(isTelegramStreamUrl('https://web.telegram.org/a/progressive/document123'), true);
  assert.equal(isTelegramStreamUrl('https://web.telegram.org/k/'), false);
  assert.equal(isTelegramStreamUrl('blob:https://web.telegram.org/abc'), false);
  assert.equal(isTelegramStreamUrl('https://evil.test/k/stream/x'), false);
  assert.equal(isTelegramStreamUrl('https://web.telegram.org.evil.test/k/stream/x'), false);
  assert.equal(isTelegramStreamUrl(undefined), false);

  assert.deepEqual(parseContentRange('bytes 0-524287/1048576'), { start: 0, end: 524287, total: 1048576 });
  assert.deepEqual(parseContentRange('bytes 10-19/*'), { start: 10, end: 19, total: null });
  assert.equal(parseContentRange('bytes 20-10/100'), null, 'end before start');
  assert.equal(parseContentRange('bytes 0-100/100'), null, 'end must be inside total');
  assert.equal(parseContentRange('items 0-1/2'), null);
  assert.equal(parseContentRange(null), null);

  assert.equal(streamFileExtension('video/mp4; codecs="avc1"'), 'mp4');
  assert.equal(streamFileExtension('video/webm'), 'webm');
  assert.equal(streamFileExtension('application/octet-stream'), 'mp4');
});
