import assert from 'node:assert/strict';
import test from 'node:test';
import { categorizeDownloadError, formatDownloadError } from '../src/shared/download-errors.ts';
import {
  FAILED_ITEMS_MAX,
  createFailedItem,
  failedItemId,
  groupFailedItemsByUsername,
  parseFailedItems,
  removeFailedItemIds,
  serializeFailedItems,
  upsertFailedItem,
} from '../src/shared/failed-items.ts';
import type { MediaItem } from '../src/types.ts';

test('F3: download errors map to machine-readable reasons without changing display text', () => {
  const cases: Array<[string, string]> = [
    ['Segment HTTP 404 Not Found', 'not_found'],
    ['SERVER_BAD_CONTENT', 'not_found'],
    ['HTTP 403', 'forbidden'],
    ['SERVER_FORBIDDEN', 'forbidden'],
    ['HTTP 429 Too Many Requests', 'rate_limited'],
    ['Download stalled (no progress for 90s): a.mp4', 'timeout'],
    ['HLS download timeout (5 min)', 'timeout'],
    ['No valid HLS stream found', 'hls'],
    ['NETWORK_FAILED', 'network'],
    // chrome.downloads: 429 and 5xx both interrupt with SERVER_FAILED; the worker
    // appends the probed status, otherwise it stays a generic server error.
    ['SERVER_FAILED HTTP 429', 'rate_limited'],
    ['SERVER_FAILED HTTP 503', 'server'],
    ['SERVER_FAILED', 'server'],
    ['HTTP 502', 'server'],
    ['Download cancelled', 'cancelled'],
    ['something odd', 'other'],
  ];
  for (const [message, reason] of cases) assert.equal(categorizeDownloadError(new Error(message)), reason, message);
  // formatDownloadError keeps its existing sentences (pinned elsewhere too).
  assert.equal(formatDownloadError(new Error('Segment HTTP 403 Forbidden')), 'Server returned HTTP error 403');
});

const media = (n: number): MediaItem => ({ type: 'image', url: `https://pbs.twimg.com/media/f${n}.jpg`, tweetId: '1850000000000000000', ext: 'jpg' });

test('F3: failed items upsert, cap, validate and group per profile', () => {
  const first = createFailedItem('NASA', media(1), 'timeout', 'Download timed out', 1_000);
  assert.ok(first);
  assert.equal(first.id, failedItemId('NASA', media(1).url));
  assert.equal(createFailedItem('bad name!', media(1), 'timeout', 'x'), null);
  assert.equal(createFailedItem('NASA', { type: 'image', url: 'https://evil.test/a.jpg' }, 'timeout', 'x'), null);

  let list = upsertFailedItem([], first);
  const again = createFailedItem('NASA', media(1), 'not_found', 'HTTP 404', 2_000);
  assert.ok(again);
  list = upsertFailedItem(list, again);
  assert.equal(list.length, 1, 'same file is updated, not duplicated');
  assert.equal(list[0].attempts, 2);
  assert.equal(list[0].reason, 'not_found');

  const other = createFailedItem('ESA', media(2), 'network', 'Network', 3_000);
  assert.ok(other);
  list = upsertFailedItem(list, other);
  assert.deepEqual(list.map((item) => item.username), ['ESA', 'NASA'], 'newest first');

  let big = list;
  for (let i = 10; i < 10 + FAILED_ITEMS_MAX + 5; i++) {
    const record = createFailedItem('NASA', media(i), 'other', 'x', i);
    assert.ok(record);
    big = upsertFailedItem(big, record);
  }
  assert.equal(big.length, FAILED_ITEMS_MAX);

  const groups = groupFailedItemsByUsername(list, [first.id, other.id, 'missing']);
  assert.deepEqual([...groups.entries()], [['ESA', [media(2).url]], ['NASA', [media(1).url]]]);
  assert.equal(removeFailedItemIds(list, [other.id]).length, 1);

  // Storage round-trip drops malformed rows instead of discarding everything.
  const parsed = parseFailedItems({ schemaVersion: 1, items: [...list, { id: 'x', username: 'NASA' }, null] });
  assert.deepEqual(parsed, list);
  assert.deepEqual(parseFailedItems(undefined), []);
  assert.deepEqual(parseFailedItems({ items: 'nope' }), []);
});

test('8.2.1: "server" failures are stored in a form 8.2.0 still accepts and round-trip back', () => {
  const media: MediaItem = { type: 'image', url: 'https://pbs.twimg.com/media/busy.jpg', tweetId: '1850000000000000001' };
  const record = createFailedItem('Erin', media, 'server', 'HTTP 503', 1_000)!;
  const stored = serializeFailedItems([record]);
  assert.equal(stored[0].reason, 'other');
  assert.equal(stored[0].serverError, true);
  // The 8.2.0 parser only knew the older reasons; a stored row must use one of them.
  const legacyReasons = new Set(['not_found', 'forbidden', 'rate_limited', 'timeout', 'network', 'hls', 'cancelled', 'other']);
  assert.ok(legacyReasons.has(stored[0].reason));
  const [restored] = parseFailedItems({ schemaVersion: 1, items: JSON.parse(JSON.stringify(stored)) });
  assert.deepEqual(restored, record);
  // Rows written by older builds (no flag) stay "other".
  const [plain] = parseFailedItems({ schemaVersion: 1, items: [{ ...record, reason: 'other' }] });
  assert.equal(plain.reason, 'other');
});
