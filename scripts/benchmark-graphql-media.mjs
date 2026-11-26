// P21 benchmark: cost of walking an X timeline GraphQL response on the main
// thread, full walk vs skipping branches that never hold tweet media
// (user_results, card). The payload mirrors the shape of UserTweets/UserMedia:
// each tweet carries its author's full profile, quoted tweets carry theirs.
// Fails if skipping changes the media that is found.
import { performance } from 'node:perf_hooks';
import { extractMediaFromResponse, GRAPHQL_SKIP_KEYS } from '../src/shared/graphql-media.ts';

const TWEETS_PER_PAGE = 20;
const RUNS = 200;

function user(id) {
  return {
    __typename: 'User', id: `VXNlcjo${id}`, rest_id: String(id),
    affiliates_highlighted_label: {}, has_graduated_access: true, is_blue_verified: id % 2 === 0,
    profile_image_shape: 'Circle',
    legacy: {
      can_dm: false, can_media_tag: true, created_at: 'Tue Jan 01 00:00:00 +0000 2019', default_profile: false,
      default_profile_image: false, description: `Photographer ${id}. Links below. ${'lorem ipsum '.repeat(8)}`,
      entities: {
        description: { urls: [{ display_url: 'example.com', expanded_url: 'https://example.com', url: 'https://t.co/abc', indices: [0, 23] }] },
        url: { urls: [{ display_url: 'example.com/me', expanded_url: 'https://example.com/me', url: 'https://t.co/def', indices: [0, 23] }] },
      },
      fast_followers_count: 0, favourites_count: 12000 + id, followers_count: 50000 + id, friends_count: 300,
      has_custom_timelines: true, is_translator: false, listed_count: 120, location: 'Earth', media_count: 3400,
      name: `Account ${id}`, normal_followers_count: 50000, pinned_tweet_ids_str: [String(9e15 + id)],
      possibly_sensitive: false, profile_banner_url: `https://pbs.twimg.com/profile_banners/${id}/1600000000`,
      profile_image_url_https: `https://pbs.twimg.com/profile_images/${id}/avatar_normal.jpg`,
      profile_interstitial_type: '', screen_name: `account_${id}`, statuses_count: 9000, translator_type: 'none',
      verified: false, want_retweets: false, withheld_in_countries: [],
    },
    professional: { rest_id: String(id), professional_type: 'Creator', category: [{ id: 1, name: 'Photography', icon_name: 'Camera' }] },
    tipjar_settings: {}, legacy_extended_profile: { birthdate: { day: 1, month: 1, visibility: 'Self', year_visibility: 'Self' } },
    verification_info: { is_identity_verified: false, reason: { description: { text: 'verified', entities: [] } } },
  };
}

function photo(tweetId, n) {
  const key = `3_${tweetId}${n}`;
  return {
    display_url: 'pic.x.com/abc', expanded_url: `https://x.com/a/status/${tweetId}/photo/${n}`, id_str: `${tweetId}${n}`, indices: [10, 33],
    media_key: key, media_url_https: `https://pbs.twimg.com/media/G${tweetId}${n}.jpg`, type: 'photo', url: 'https://t.co/pic',
    ext_media_availability: { status: 'Available' },
    features: { large: { faces: [{ x: 1, y: 2, h: 3, w: 4 }] }, medium: { faces: [] }, small: { faces: [] }, orig: { faces: [] } },
    sizes: { large: { h: 2048, w: 1536, resize: 'fit' }, medium: { h: 1200, w: 900, resize: 'fit' }, small: { h: 680, w: 510, resize: 'fit' }, thumb: { h: 150, w: 150, resize: 'crop' } },
    original_info: { height: 2048, width: 1536, focus_rects: [{ x: 0, y: 0, w: 1536, h: 860 }, { x: 0, y: 0, w: 1536, h: 1536 }] },
    media_results: { result: { media_key: key } },
  };
}

function video(tweetId) {
  const v = photo(tweetId, 9);
  return {
    ...v, type: 'video', media_url_https: `https://pbs.twimg.com/ext_tw_video_thumb/${tweetId}/pu/img/x.jpg`,
    video_info: {
      aspect_ratio: [16, 9], duration_millis: 30000,
      variants: [
        { content_type: 'application/x-mpegURL', url: `https://video.twimg.com/ext_tw_video/${tweetId}/pu/pl/x.m3u8` },
        { bitrate: 632000, content_type: 'video/mp4', url: `https://video.twimg.com/ext_tw_video/${tweetId}/pu/vid/480x270/a.mp4` },
        { bitrate: 2176000, content_type: 'video/mp4', url: `https://video.twimg.com/ext_tw_video/${tweetId}/pu/vid/1280x720/b.mp4` },
      ],
    },
  };
}

function card(id) {
  const value = (key, v) => ({ key, value: { string_value: v, type: 'STRING' } });
  return {
    rest_id: `card://${id}`,
    legacy: {
      binding_values: [
        value('title', 'Article title'), value('description', 'lorem ipsum '.repeat(10)), value('domain', 'example.com'),
        { key: 'thumbnail_image', value: { image_value: { height: 144, width: 144, url: `https://pbs.twimg.com/card_img/${id}/x?format=jpg&name=144x144` }, type: 'IMAGE' } },
        { key: 'summary_photo_image', value: { image_value: { height: 600, width: 1200, url: `https://pbs.twimg.com/card_img/${id}/y?format=jpg&name=600x600` }, type: 'IMAGE' } },
      ],
      card_platform: { platform: { audience: { name: 'production' }, device: { name: 'Swift', version: '12' } } },
      name: 'summary_large_image', url: 'https://t.co/card', user_refs_results: [{ result: user(id + 7) }],
    },
  };
}

function tweet(id, index, depth = 0) {
  const media = index % 3 === 0 ? [video(id)] : [photo(id, 1), photo(id, 2)];
  const result = {
    __typename: 'Tweet', rest_id: String(id),
    core: { user_results: { result: user(index) } },
    unmention_data: {}, edit_control: { edit_tweet_ids: [String(id)], editable_until_msecs: '1', is_edit_eligible: true, edits_remaining: '5' },
    is_translatable: false, views: { count: '12345', state: 'EnabledWithCount' }, source: '<a href="https://x.com">X Web App</a>',
    legacy: {
      bookmark_count: 3, bookmarked: false, created_at: 'Tue Jan 01 00:00:00 +0000 2026', conversation_id_str: String(id),
      display_text_range: [0, 120], favorite_count: 100 + index, favorited: false, full_text: `Tweet ${id} ${'text '.repeat(20)}`,
      id_str: String(id), is_quote_status: false, lang: 'en', possibly_sensitive: false, quote_count: 1, reply_count: 2,
      retweet_count: 3, retweeted: false, user_id_str: String(index),
      entities: { hashtags: [{ indices: [1, 5], text: 'tag' }], symbols: [], urls: [], user_mentions: [], media },
      extended_entities: { media },
    },
  };
  if (index % 4 === 1) result.card = card(id);
  if (depth === 0 && index % 5 === 2) result.quoted_status_result = { result: tweet(id + 1, index + 1, 1) };
  return result;
}

function timelinePage(offset) {
  const entries = Array.from({ length: TWEETS_PER_PAGE }, (_, i) => ({
    entryId: `tweet-${offset + i}`, sortIndex: String(offset + i),
    content: { entryType: 'TimelineTimelineItem', __typename: 'TimelineTimelineItem',
      itemContent: { itemType: 'TimelineTweet', __typename: 'TimelineTweet', tweet_results: { result: tweet(1.8e18 + (offset + i) * 10, i) }, tweetDisplayType: 'Tweet' } },
  }));
  return { data: { user: { result: { __typename: 'User', timeline_v2: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] } } } } } };
}

function countNodes(value, skip, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 35) return 0;
  let n = 1;
  for (const key in value) if (!skip.has(key)) n += countNodes(value[key], skip, depth + 1);
  return n;
}

function measure(payload, skip) {
  const times = [];
  let found = [];
  for (let i = 0; i < RUNS; i++) {
    const results = [];
    const start = performance.now();
    extractMediaFromResponse(payload, results, skip);
    times.push(performance.now() - start);
    found = results;
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(RUNS / 2)], p95: times[Math.floor(RUNS * 0.95)], found };
}

const payload = timelinePage(0);
const none = new Set();
const full = measure(payload, none);
const pruned = measure(payload, GRAPHQL_SKIP_KEYS);
const bytes = JSON.stringify(payload).length;
const nodesFull = countNodes(payload, none);
const nodesPruned = countNodes(payload, GRAPHQL_SKIP_KEYS);

if (JSON.stringify(full.found) !== JSON.stringify(pruned.found)) {
  console.error('GraphQL media benchmark: skipping branches changed the media found');
  process.exit(1);
}
if (full.found.length === 0) {
  console.error('GraphQL media benchmark: no media found in the synthetic page');
  process.exit(1);
}
console.log(`GraphQL media walk (${TWEETS_PER_PAGE} tweets, ${Math.round(bytes / 1024)} KB JSON, ${full.found.length} media):`);
console.log(`  full walk   ${nodesFull} nodes, median ${full.median.toFixed(3)} ms, p95 ${full.p95.toFixed(3)} ms`);
console.log(`  skip ${[...GRAPHQL_SKIP_KEYS].join('/')}  ${nodesPruned} nodes, median ${pruned.median.toFixed(3)} ms, p95 ${pruned.p95.toFixed(3)} ms`);
console.log(`  nodes -${Math.round((1 - nodesPruned / nodesFull) * 100)}%, median -${Math.round((1 - pruned.median / full.median) * 100)}%`);
