import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_KIND,
  BACKUP_MAX_URLS_PER_PROFILE,
  chunkByJsonSize,
  mergeHistory,
  mergeSavedJobs,
  parseBackupFile,
  summarizeBackup,
} from '../src/shared/backup.ts';
import type { HistoryEntry, SavedJob } from '../src/types.ts';

const job = (id: string, name = id): SavedJob => ({
  id, name, username: 'NASA', filterType: 'all', keyword: '', dateFrom: '', dateTo: '',
  saveFolder: '', filenameTemplate: '', skipDuplicates: true, schemaVersion: 1, createdAt: 1, updatedAt: 1,
});

test('F5: a backup file is accepted only with the right kind/version and every section is re-validated', () => {
  assert.equal(parseBackupFile(null), null);
  assert.equal(parseBackupFile({ kind: 'other', schemaVersion: 1 }), null);
  assert.equal(parseBackupFile({ kind: BACKUP_KIND, schemaVersion: 2 }), null);

  const data = parseBackupFile({
    kind: BACKUP_KIND, schemaVersion: 1, appVersion: '8.1.0', exportedAt: '2026-10-14T00:00:00Z',
    options: { concurrency: 4 },
    savedJobs: [job('a'), { id: 'broken' }],
    schedules: [{ jobId: 'a', enabled: true, intervalMinutes: 60 }, { jobId: 'a', enabled: 'yes', intervalMinutes: 60 }, { jobId: 'b', enabled: true, intervalMinutes: 1 }],
    queue: 'not an array',
    history: [{ username: 'NASA', count: 2, filter: 'all', date: '2026-10-13T00:00:00Z' }, { username: 42 }],
    downloaded: {
      NASA: ['https://pbs.twimg.com/media/a.jpg?name=orig&format=', 'https://pbs.twimg.com/media/a.jpg?name=orig&format=', 'https://evil.test/x.jpg', 7],
      'bad user!': ['https://pbs.twimg.com/media/b.jpg'],
      ESA: [],
    },
  });
  assert.ok(data);
  assert.deepEqual(data.savedJobs.map((item) => item.id), ['a']);
  assert.equal(data.schedules.length, 1, 'invalid schedules dropped (bad type, interval below minimum)');
  assert.deepEqual(data.queue, []);
  assert.equal(data.history.length, 1);
  assert.deepEqual(data.downloaded, { NASA: ['https://pbs.twimg.com/media/a.jpg?name=orig&format='] }, 'only trusted CDN URLs, deduped, valid usernames, non-empty');
  assert.deepEqual(summarizeBackup(data), { jobs: 1, schedules: 1, queue: 0, history: 1, profiles: 1, urls: 1 });

  const big = parseBackupFile({ kind: BACKUP_KIND, schemaVersion: 1, downloaded: {
    NASA: Array.from({ length: BACKUP_MAX_URLS_PER_PROFILE + 10 }, (_, i) => `https://pbs.twimg.com/media/${i}.jpg`),
  } });
  assert.equal(big?.downloaded.NASA.length, BACKUP_MAX_URLS_PER_PROFILE);
});

test('F5: restore merges instead of replacing, and messages stay under the size limit', () => {
  const merged = mergeSavedJobs([job('a', 'old'), job('b')], [job('a', 'new'), job('c'), job('d')], 3);
  assert.deepEqual(merged.jobs.map((item) => `${item.id}:${item.name}`), ['a:new', 'b:b', 'c:c']);
  assert.equal(merged.updated, 1);
  assert.equal(merged.added, 1, 'job d is dropped at the cap');

  const entry = (username: string, date: string): HistoryEntry => ({ username, count: 1, filter: 'all', date });
  const history = mergeHistory(
    [entry('NASA', '2026-10-10T00:00:00Z'), entry('ESA', '2026-10-12T00:00:00Z')],
    [entry('NASA', '2026-10-10T00:00:00Z'), entry('NASA', '2026-10-14T00:00:00Z')],
    10,
  );
  assert.deepEqual(history.map((item) => item.date.slice(0, 10)), ['2026-10-14', '2026-10-12', '2026-10-10'], 'deduped, newest first');

  const urls = Array.from({ length: 6_000 }, (_, i) => `https://pbs.twimg.com/media/${String(i).padStart(20, '0')}.jpg?name=orig&format=jpg`);
  const chunks = chunkByJsonSize(urls);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat(), urls, 'chunking loses and reorders nothing');
  for (const chunk of chunks) assert.ok(JSON.stringify(chunk).length <= 180_000);
  assert.deepEqual(chunkByJsonSize([]), []);
});
