import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTrustedMediaUrl,
  isValidDownloadOptions,
  isXProfileUrlForUsername,
  isValidMediaItem,
  isValidUsername,
  parseQueueItems,
  sanitizeFilename,
  sanitizeFolderPath,
} from '../src/shared/validation.ts';
import { formatDownloadError } from '../src/shared/download-errors.ts';
import { parseExtensionMessage } from '../src/shared/messages.ts';
import { addDiagnosticEvent, emptyDiagnostics } from '../src/shared/diagnostics.ts';
import { filterMediaItems } from '../src/shared/media-filter.ts';
import { canTransitionCollectPhase } from '../src/shared/collect-state.ts';
import { recoverQueueItemAfterRestart, transitionQueueItem } from '../src/shared/queue-state.ts';

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
