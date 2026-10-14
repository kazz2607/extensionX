import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell } from '../src/shared/csv.ts';
import { isValidMediaItem } from '../src/shared/validation.ts';

test('F2: caption CSV cells survive commas, quotes, newlines and formula injection', () => {
  assert.equal(csvCell('hello, "world"\nnext'), '"hello, ""world""\nnext"');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(42), '"42"');
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell('+1 cool'), `"'+1 cool"`);
  assert.equal(csvCell('@user hi'), `"'@user hi"`);
});

test('F2: media items may carry a like count, which must be a non-negative integer', () => {
  const base = { type: 'image', url: 'https://pbs.twimg.com/media/abc.jpg', tweetId: '1850000000000000000' };
  assert.equal(isValidMediaItem({ ...base, likeCount: 1234 }), true);
  assert.equal(isValidMediaItem({ ...base, likeCount: 0 }), true);
  assert.equal(isValidMediaItem({ ...base }), true);
  assert.equal(isValidMediaItem({ ...base, likeCount: -1 }), false);
  assert.equal(isValidMediaItem({ ...base, likeCount: 1.5 }), false);
  assert.equal(isValidMediaItem({ ...base, likeCount: '12' }), false);
});
