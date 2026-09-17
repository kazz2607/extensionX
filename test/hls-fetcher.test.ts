import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchHLS } from '../src/lib/hls-fetcher.ts';

test('retries transient HLS failures and returns every segment', async () => {
  const originalFetch = globalThis.fetch;
  let playlistRequests = 0;
  globalThis.fetch = (async (url: string | URL) => {
    const href = String(url);
    if (href.endsWith('playlist.m3u8')) {
      playlistRequests++;
      if (playlistRequests === 1) return new Response('', { status: 503 });
      return new Response('#EXTM3U\nsegment.ts\n');
    }
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
  }) as typeof fetch;
  try {
    const progress: number[] = [];
    const blob = await fetchHLS('https://video.twimg.com/a/playlist.m3u8', (done) => progress.push(done));
    assert.equal(playlistRequests, 2);
    assert.equal(blob.size, 3);
    assert.deepEqual(progress, [1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aborts HLS before it can start network work', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchHLS('https://video.twimg.com/a/playlist.m3u8', undefined, { signal: controller.signal }), { name: 'AbortError' });
});

test('aborts HLS while waiting to retry a transient error', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    controller.abort();
    return new Response('', { status: 503 });
  }) as typeof fetch;
  try {
    await assert.rejects(fetchHLS('https://video.twimg.com/a/playlist.m3u8', undefined, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
