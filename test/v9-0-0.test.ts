import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMediaFromResponse, pickVideoVariant } from '../src/shared/graphql-media.ts';
import { isValidMediaItem, isValidVariantList } from '../src/shared/validation.ts';
import { createFailedItem, parseFailedItems, serializeFailedItems, upsertFailedItem } from '../src/shared/failed-items.ts';
import type { MediaItem } from '../src/types.ts';
import { collectionKeyLabel, collectionSourceUrl, isSearchSourceKey, listIdFromKey, listNameFromTitle, listSourceKey, searchSourceFromUrl, searchSourceKey, searchSourceLabel } from '../src/shared/collection-source.ts';
import { collectionKeyFromInput, isCollectMediaPageUrl, isCollectPageFor, isValidUsername, usernameFromXUrl } from '../src/shared/validation.ts';

const vid = (size: string) => `https://video.twimg.com/ext_tw_video/1850000000000000001/pu/vid/${size}/a.mp4`;

test('F3b: the best mp4 is chosen and lower qualities are kept in descending order', () => {
  const picked = pickVideoVariant([
    { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/ext_tw_video/1/pu/pl/x.m3u8' },
    { content_type: 'video/mp4', bitrate: 632_000, url: vid('480x270') },
    { content_type: 'video/mp4', bitrate: 2_176_000, url: vid('1280x720') },
    { content_type: 'video/mp4', bitrate: 950_000, url: vid('640x360') },
  ]);
  assert.deepEqual(picked, { url: vid('1280x720'), isHls: false, bitrate: 2_176_000, lower: [vid('640x360'), vid('480x270')] });
  // Syndication shape (type/src) and HLS-only videos.
  assert.equal(pickVideoVariant([{ type: 'video/mp4', src: vid('720x720'), bitrate: 1 }])?.url, vid('720x720'));
  const hls = pickVideoVariant([{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x/pl/a.m3u8' }]);
  assert.deepEqual(hls && { isHls: hls.isHls, lower: hls.lower }, { isHls: true, lower: [] });
  assert.equal(pickVideoVariant([]), null);
});

test('F3b: GraphQL media carries the lower qualities only when there are some', () => {
  const tweet = (variants: unknown[]) => ({ legacy: { id_str: '1850000000000000001', extended_entities: { media: [{ type: 'video', media_key: 'k', video_info: { variants } }] } } });
  const found: MediaItem[] = [];
  extractMediaFromResponse(tweet([
    { content_type: 'video/mp4', bitrate: 2, url: vid('1280x720') },
    { content_type: 'video/mp4', bitrate: 1, url: vid('640x360') },
  ]), found);
  extractMediaFromResponse(tweet([{ content_type: 'video/mp4', bitrate: 2, url: vid('720x720') }]), found);
  assert.deepEqual(found[0].variants, [vid('640x360')]);
  assert.equal('variants' in found[1], false);
  assert.equal(found.every(isValidMediaItem), true);
});

test('F3b: variant lists from the page or storage are validated', () => {
  assert.equal(isValidVariantList([vid('640x360')]), true);
  assert.equal(isValidVariantList([]), true);
  assert.equal(isValidVariantList(['https://evil.example/a.mp4']), false, 'untrusted host');
  assert.equal(isValidVariantList(['https://pbs.twimg.com/media/a.mp4']), false, 'only video.twimg.com');
  assert.equal(isValidVariantList(['https://video.twimg.com/x/pl/a.m3u8']), false, 'mp4 only');
  assert.equal(isValidVariantList(Array.from({ length: 5 }, () => vid('640x360'))), false, 'at most 4');
  assert.equal(isValidVariantList('nope'), false);
  const video: MediaItem = { type: 'video', url: vid('1280x720'), tweetId: '1850000000000000001', ext: 'mp4' };
  assert.equal(isValidMediaItem({ ...video, variants: ['javascript:alert(1)'] }), false);
});

test('F3b: failed videos remember their lower qualities, round-trip storage and step down', () => {
  const video: MediaItem = { type: 'video', url: vid('1280x720'), tweetId: '1850000000000000001', ext: 'mp4', variants: [vid('640x360'), vid('480x270')] };
  const first = createFailedItem('NASA', video, 'not_found', 'HTTP 404', 1)!;
  assert.deepEqual(first.variants, [vid('640x360'), vid('480x270')]);
  const stored = parseFailedItems({ items: serializeFailedItems([first]) });
  assert.deepEqual(stored[0].variants, first.variants);

  // The 640x360 retry failed too: the next record only offers 480x270, same id.
  const second = createFailedItem('NASA', { ...video, variants: [vid('480x270')] }, 'not_found', 'HTTP 404', 2)!;
  const list = upsertFailedItem(stored, second);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].variants, [vid('480x270')]);
  assert.equal(list[0].attempts, 2);
  // Last level failed: nothing lower is left.
  const last = createFailedItem('NASA', { ...video, variants: [] }, 'not_found', 'HTTP 404', 3)!;
  assert.equal('variants' in upsertFailedItem(list, last)[0], false);

  // A stored record with a forged variant is dropped, not trusted.
  assert.deepEqual(parseFailedItems({ items: [{ ...first, variants: ['https://evil.example/x.mp4'] }] }), []);
});


test('F1b: X List pages are a collection source with a reversible key', () => {
  const list = searchSourceFromUrl('https://x.com/i/lists/1585430245762441216');
  assert.deepEqual(list, { kind: 'list', query: '1585430245762441216', key: '_list_1585430245762441216' });
  // Short (old) list ids are padded so the key is longer than any X handle (15).
  assert.equal(listSourceKey('1234567'), '_list_0001234567');
  assert.ok(listSourceKey('1').length >= 16);
  assert.equal(listIdFromKey('_list_0001234567'), '1234567');
  assert.equal(listIdFromKey('_list_123'), null, 'a 9-character handle is not a list key');
  assert.equal(collectionSourceUrl('_list_0001234567'), 'https://x.com/i/lists/1234567');
  assert.equal(collectionSourceUrl(searchSourceKey('search', 'cats')), null, 'search keys are one-way');
  assert.equal(isSearchSourceKey('_list_0001234567'), true);
  assert.equal(isValidUsername('_list_0001234567'), true, 'fits the existing username-shaped key');

  for (const page of ['https://x.com/i/lists/123/members', 'https://x.com/i/lists/123/followers', 'https://x.com/i/lists/abc', 'https://x.com/i/lists']) {
    assert.equal(searchSourceFromUrl(page), null, page);
  }
  const url = 'https://x.com/i/lists/1234567';
  assert.equal(usernameFromXUrl(url), '_list_0001234567');
  assert.equal(isCollectMediaPageUrl(url), true);
  assert.equal(isCollectPageFor(url, '_list_0001234567'), true);
  assert.equal(usernameFromXUrl('https://x.com/i/lists/1234567/members'), null);
});

test('F1b: List labels use the tab title when there is one, the id otherwise', () => {
  assert.equal(listNameFromTitle('Photographers / X'), 'Photographers');
  assert.equal(listNameFromTitle('(12) Space / news / X'), 'Space / news');
  assert.equal(listNameFromTitle('Home'), '');
  const source = searchSourceFromUrl('https://x.com/i/lists/1234567')!;
  assert.equal(searchSourceLabel(source, 'Photographers / X'), '📋 Photographers');
  assert.equal(searchSourceLabel(source), '📋 1234567');
  assert.equal(collectionKeyLabel('_list_0001234567'), '📋 1234567');
  assert.equal(collectionKeyLabel('NASA'), '@NASA');
});

test('F1c: a Saved Job source can be a handle, a #hashtag or an X link', () => {
  assert.equal(collectionKeyFromInput('NASA'), 'NASA');
  assert.equal(collectionKeyFromInput(' @NASA '), 'NASA');
  assert.equal(collectionKeyFromInput('#Cats'), searchSourceKey('hashtag', 'Cats'));
  assert.equal(collectionKeyFromInput('#cats'), usernameFromXUrl('https://x.com/hashtag/Cats'), 'same key as collecting the hashtag page');
  assert.equal(collectionKeyFromInput('https://x.com/search?q=cat%20photos&src=typed_query'), searchSourceKey('search', 'cat photos'));
  assert.equal(collectionKeyFromInput('x.com/i/lists/1234567'), '_list_0001234567');
  assert.equal(collectionKeyFromInput('https://mobile.twitter.com/NASA/media'), 'NASA');
  assert.equal(collectionKeyFromInput('https://x.com/i/bookmarks'), '_bookmarks_');
  assert.equal(collectionKeyFromInput(searchSourceKey('search', 'cats')), searchSourceKey('search', 'cats'), 'stored keys round-trip when a job is edited');
  for (const bad of ['', '#', '# two words', 'https://evil.example/NASA', 'https://x.com/home', 'not a handle!', 'x'.repeat(51)]) {
    assert.equal(collectionKeyFromInput(bad), null, JSON.stringify(bad));
  }
});
