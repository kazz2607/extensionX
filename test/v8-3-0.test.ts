import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalImageUrl,
  canonicalizeMediaItem,
  isCollectMediaPageUrl,
  normalizeUrlForDedup,
  usernameFromXUrl,
} from '../src/shared/validation.ts';
import { mergeForcedDedupIds } from '../src/shared/queue-state.ts';
import { isAllowedSender } from '../src/shared/messages.ts';
import { fileTooLarge, IMPORT_FILE_MAX_BYTES } from '../src/shared/options-import.ts';
import { isTelegramDownloadUrl, telegramDownloadFilename } from '../src/shared/telegram-media.ts';
import { planDownloadedUrlPrune } from '../src/shared/bounded-cache.ts';
import type { MediaItem } from '../src/types.ts';

test('L21: both URL forms of one X image become one canonical item', () => {
  const graphql: MediaItem = { type: 'image', url: 'https://pbs.twimg.com/media/ABC.jpg', ext: 'jpg' };
  const dom: MediaItem = { type: 'image', url: 'https://pbs.twimg.com/media/ABC?format=jpg&name=small', ext: 'jpg' };
  assert.equal(canonicalizeMediaItem(graphql).url, canonicalizeMediaItem(dom).url);
  assert.equal(canonicalizeMediaItem(graphql).url, 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
  assert.equal(normalizeUrlForDedup(graphql.url), normalizeUrlForDedup(dom.url));
  // Videos, thumbnails and other hosts are left alone.
  const video: MediaItem = { type: 'video', url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1x1/a.mp4' };
  assert.equal(canonicalizeMediaItem(video), video);
  assert.equal(canonicalImageUrl('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg'), 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg');
});

test('L27: DOM images take their extension from format=, and the size option applies', () => {
  const png: MediaItem = { type: 'image', url: 'https://pbs.twimg.com/media/XYZ?format=png&name=small', ext: 'jpg' };
  assert.equal(canonicalizeMediaItem(png).ext, 'png');
  assert.equal(canonicalImageUrl('https://pbs.twimg.com/media/ABC.jpg', 'large'), 'https://pbs.twimg.com/media/ABC?format=jpg&name=large');
  assert.equal(canonicalImageUrl('https://pbs.twimg.com/media/ABC.jpg', 'huge'), 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig', 'unknown size falls back to orig');
});

test('L23: a tweet likes list is not a likes collection page', () => {
  assert.equal(usernameFromXUrl('https://x.com/alice/likes'), 'alice_likes');
  assert.equal(usernameFromXUrl('https://x.com/alice/status/1850000000000000001/likes'), 'alice');
  assert.equal(isCollectMediaPageUrl('https://x.com/alice/status/1850000000000000001/likes'), false);
  assert.equal(isCollectMediaPageUrl('https://x.com/alice/likes'), true);
  assert.equal(isCollectMediaPageUrl('https://x.com/alice/media'), true);
  assert.equal(isCollectMediaPageUrl('https://x.com/i/bookmarks'), true);
  assert.equal(isCollectMediaPageUrl('https://x.com/mediapart'), false);
});

test('L25: forced dedup ids survive restarts and drop ids no longer queued', () => {
  const queue = new Set(['a', 'b', 'c']);
  assert.deepEqual(mergeForcedDedupIds(['a', 'gone', 7], new Set(['b']), queue).sort(), ['a', 'b']);
  assert.deepEqual(mergeForcedDedupIds(undefined, [], queue), []);
});

test('S16: content-script commands are bound to the page origin that sends them', () => {
  const origin = 'chrome-extension://abc/';
  assert.equal(isAllowedSender('START_COLLECTING', 'https://x.com/alice/media', origin), true);
  assert.equal(isAllowedSender('START_COLLECTING', 'https://web.telegram.org/k/', origin), false);
  // 9.1.0 (S19): Telegram saves files in its own page; it sends no runtime command at all.
  assert.equal(isAllowedSender('MEDIA_FOUND', 'https://web.telegram.org/k/', origin), false);
  assert.equal(isAllowedSender('MEDIA_FOUND', 'https://evil.example/x.com', origin), false);
  assert.equal(isAllowedSender('MEDIA_FOUND', 'http://x.com/alice', origin), false, 'https only');
});

test('S17: oversized import files are rejected before being read', () => {
  assert.equal(fileTooLarge(500_000, IMPORT_FILE_MAX_BYTES.settings), null);
  assert.deepEqual(fileTooLarge(5_000_000, IMPORT_FILE_MAX_BYTES.settings), { size: '5.0', max: '1.0' });
  assert.deepEqual(fileTooLarge(250_000_000, IMPORT_FILE_MAX_BYTES.backup), { size: '250', max: '200' });
});

test('S18: Telegram data URLs must be a known image/video type and keep a matching extension', () => {
  assert.equal(isTelegramDownloadUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isTelegramDownloadUrl('data:text/html,<b>x</b>'), false);
  assert.equal(isTelegramDownloadUrl('data:image/png;base64,iVBOR'), true);
  assert.equal(telegramDownloadFilename('data:image/png;base64,iVBOR', 'telegram_image_1.html'), 'telegram_image_1.png');
  assert.equal(telegramDownloadFilename('blob:https://web.telegram.org/abc', 'telegram_video_1.mp4'), 'telegram_video_1.mp4');
  assert.equal(telegramDownloadFilename('blob:https://web.telegram.org/abc', 'page.html'), null);
});

test('P18: downloaded URL history is pruned and returned in one pass', () => {
  const now = 1_000_000;
  const records = [
    { id: 'old', url: 'u-old', addedAt: now - 500 },
    { id: 'a', url: 'u-a', addedAt: now - 30 },
    { id: 'b', url: 'u-b', addedAt: now - 20 },
    { id: 'c', url: 'u-c', addedAt: now - 10 },
  ];
  const plan = planDownloadedUrlPrune(records, now, 2, 100);
  assert.deepEqual(plan.removeIds.sort(), ['a', 'old']);
  assert.deepEqual(plan.keptUrls, ['u-b', 'u-c']);
  assert.deepEqual(planDownloadedUrlPrune(records.slice(1), now, 10, 100).removeIds, [], 'nothing to prune');
});
