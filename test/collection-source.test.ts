import assert from 'node:assert/strict';
import test from 'node:test';
import { isSearchSourceKey, searchSourceFromUrl, searchSourceKey, searchSourceLabel } from '../src/shared/collection-source.ts';
import { isValidUsername, isXProfileUrlForUsername, usernameFromXUrl } from '../src/shared/validation.ts';

test('F1: Search and Hashtag pages map to stable, username-shaped collection keys', () => {
  const search = searchSourceFromUrl('https://x.com/search?q=cat%20photos&src=typed_query&f=media');
  assert.ok(search);
  assert.equal(search.kind, 'search');
  assert.equal(search.query, 'cat photos');
  assert.match(search.key, /^_search_cat_photos_h[a-z0-9]+$/);
  assert.equal(searchSourceLabel(search), '🔍 cat photos');

  // Same query (case/whitespace/search tab differ) → same key, so data accumulates.
  assert.equal(searchSourceFromUrl('https://x.com/search?q=Cat%20%20Photos&f=live')?.key, search.key);
  // Different query → different key, even when the readable part is identical.
  assert.notEqual(searchSourceKey('search', 'cat photos!'), searchSourceKey('search', 'cat photos?'));

  const hashtag = searchSourceFromUrl('https://twitter.com/hashtag/Cats?src=hashtag_click');
  assert.ok(hashtag);
  assert.equal(hashtag.kind, 'hashtag');
  assert.equal(searchSourceLabel(hashtag), '#Cats');
  assert.notEqual(hashtag.key, searchSourceKey('search', 'Cats'));

  // Unicode queries get a hash-only or accent-stripped readable part.
  const vi = searchSourceFromUrl('https://x.com/hashtag/%C4%90%C3%A0N%E1%BA%B5ng');
  assert.ok(vi && /^_hashtag_dan.*_h[a-z0-9]+$/.test(vi.key));
  assert.match(searchSourceKey('search', '猫'), /^_search_h[a-z0-9]+$/);

  for (const source of [search, hashtag, vi]) {
    assert.equal(isValidUsername(source.key), true, source.key);
    assert.equal(isSearchSourceKey(source.key), true, source.key);
    assert.equal(source.key.endsWith('_likes'), false);
    assert.ok(source.key.length <= 50);
  }
});

test('F1: the shared URL parser recognizes Search/Hashtag without changing profile behavior', () => {
  const url = 'https://x.com/search?q=nasa&f=media';
  const key = usernameFromXUrl(url);
  assert.equal(key, searchSourceKey('search', 'nasa'));
  assert.equal(isXProfileUrlForUsername(url, key), true);
  assert.equal(isXProfileUrlForUsername('https://x.com/search?q=other', key), false);

  assert.equal(usernameFromXUrl('https://x.com/search'), null, 'empty query is not collectible');
  assert.equal(usernameFromXUrl('https://x.com/hashtag'), null, '"hashtag" is not a username');
  assert.equal(usernameFromXUrl('https://x.com/NASA/media'), 'NASA');
  assert.equal(usernameFromXUrl('https://x.com/NASA/likes'), 'NASA_likes');
  assert.equal(usernameFromXUrl('https://x.com/i/bookmarks'), '_bookmarks_');
  assert.equal(usernameFromXUrl('https://evil.test/search?q=nasa'), null);
  assert.equal(isSearchSourceKey('NASA'), false);
  assert.equal(isSearchSourceKey('_bookmarks_'), false);
});
