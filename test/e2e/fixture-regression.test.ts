import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from '../fixtures/graphql-media.json' with { type: 'json' };
import { filterMediaItems } from '../../src/shared/media-filter.ts';
import { canTransitionQueueStatus, transitionQueueItem } from '../../src/shared/queue-state.ts';
import { isValidMediaItem } from '../../src/shared/validation.ts';

test('sanitized GraphQL fixture preserves media and removes avatars', () => {
  const media = fixture.data.media;
  assert.equal(media.every(isValidMediaItem), true);
  const result = filterMediaItems(media, { smartFilters: { filterAvatars: true, filterCardImages: true } });
  assert.deepEqual(result.map((item) => item.type), ['image', 'video']);
});

test('queue state fixture rejects invalid transitions and permits retry', () => {
  const item = { id: 'NASA_1', username: 'NASA', filterType: 'all', skipDuplicates: true, addedAt: 1, status: 'waiting' as const, mediaCount: 1 };
  assert.equal(canTransitionQueueStatus('waiting', 'done'), false);
  assert.equal(transitionQueueItem(item, 'done'), null);
  const active = transitionQueueItem(item, 'downloading');
  assert.equal(active?.status, 'downloading');
  assert.equal(active && transitionQueueItem({ ...active, status: 'error' }, 'waiting')?.status, 'waiting');
});
