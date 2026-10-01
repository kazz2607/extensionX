import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageAreaAdapter } from '../src/background/chrome-api.ts';
import { DB_VERSION, getDatabaseMigrationPlan } from '../src/background/indexeddb.ts';
import type { MediaRepository } from '../src/background/media-repository.ts';
import { DOWNLOAD_HISTORY_SCHEMA_VERSION, migrateDownloadHistoryStorage } from '../src/shared/download-history.ts';
import { migrateSavedJobsStorage, parseSavedJobInput, SAVED_JOBS_SCHEMA_VERSION } from '../src/shared/saved-jobs.ts';
import { createQueueStorageSnapshot, migrateOptionsStorage, migrateQueueStorage, OPTIONS_SCHEMA_VERSION, QUEUE_SCHEMA_VERSION } from '../src/shared/storage-migrations.ts';

test('migrates legacy Options without losing user values', () => {
  const migrated = migrateOptionsStorage({ _version: '5.7.0', concurrency: 5, localDiagnostics: true });
  assert.equal(migrated.schemaVersion, OPTIONS_SCHEMA_VERSION);
  assert.equal(migrated.concurrency, 5);
  assert.equal(migrated.localDiagnostics, true);
  assert.equal('_version' in migrated, false);
});

test('migrates Queue raw arrays and versioned snapshots to schema v3', () => {
  const legacyItem = {
    id: 'NASA_1', username: 'NASA', filterType: 'all', skipDuplicates: true,
    addedAt: 1, status: 'downloading', mediaCount: 2, result: null,
  };
  const legacy = migrateQueueStorage([legacyItem]);
  assert.equal(legacy.schemaVersion, QUEUE_SCHEMA_VERSION);
  assert.equal(legacy.items[0]?.status, 'paused');

  const current = migrateQueueStorage({ schemaVersion: 2, items: [{ ...legacyItem, status: 'waiting', paused: true }] });
  assert.equal(current.items.length, 1);
  assert.equal(current.items[0]?.status, 'paused');
  assert.equal(current.items[0]?.paused, undefined);
  const rollbackCompatible = createQueueStorageSnapshot(current.items);
  assert.equal(rollbackCompatible.items[0]?.status, 'waiting');
  assert.equal(rollbackCompatible.items[0]?.paused, true);
  assert.deepEqual(migrateQueueStorage({ schemaVersion: 99, items: 'broken' }).items, []);
});

test('migrates legacy download history without losing rollback-compatible entries', () => {
  const legacy = [{ username: 'NASA', count: 4, filter: 'images', date: '2026-09-30T00:00:00.000Z' }];
  const migrated = migrateDownloadHistoryStorage(legacy);
  assert.equal(migrated.schemaVersion, DOWNLOAD_HISTORY_SCHEMA_VERSION);
  assert.deepEqual(migrated.entries, legacy);
  assert.deepEqual(migrateDownloadHistoryStorage({ schemaVersion: 2, entries: legacy }).entries, legacy);
  assert.deepEqual(migrateDownloadHistoryStorage({ entries: [{ username: '../../bad' }] }).entries, []);
});

test('validates and migrates Saved Jobs into schema v1', () => {
  const input = {
    id: 'nasa-images', name: 'NASA images', username: 'NASA', filterType: 'images',
    skipDuplicates: true, keyword: 'moon', dateFrom: '2026-01-01', dateTo: '2026-09-30',
    saveFolder: '../NASA//images', filenameTemplate: '{username}_{tweetId}.{ext}',
  };
  assert.equal(parseSavedJobInput(input)?.saveFolder, '_/NASA/images');
  assert.equal(parseSavedJobInput({ ...input, dateFrom: '2026-10-01' }), null);
  assert.equal(parseSavedJobInput({ ...input, dateFrom: '2026-02-31' }), null);
  const migrated = migrateSavedJobsStorage([{ ...input, schemaVersion: 1, createdAt: 10, updatedAt: 20 }]);
  assert.equal(migrated.schemaVersion, SAVED_JOBS_SCHEMA_VERSION);
  assert.equal(migrated.jobs[0]?.id, 'nasa-images');
  assert.equal(migrated.jobs[0]?.updatedAt, 20);
});

test('IndexedDB migration plan is ordered and current', () => {
  assert.equal(DB_VERSION, 3);
  assert.deepEqual(getDatabaseMigrationPlan(0), [1, 2, 3]);
  assert.deepEqual(getDatabaseMigrationPlan(1), [2, 3]);
  assert.deepEqual(getDatabaseMigrationPlan(2), [3]);
  assert.deepEqual(getDatabaseMigrationPlan(3), []);
});

test('Chrome storage adapter is replaceable with an isolated fake', async () => {
  const values: Record<string, unknown> = {};
  const adapter = createStorageAreaAdapter({
    async get(key) { return typeof key === 'string' ? { [key]: values[key] } : { ...values }; },
    async set(items) { Object.assign(values, items); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  });
  await adapter.set({ queue: [1, 2] });
  assert.deepEqual(await adapter.get('queue'), { queue: [1, 2] });
  await adapter.remove('queue');
  assert.deepEqual(await adapter.get('queue'), { queue: undefined });
});

test('media persistence has a mockable repository contract', async () => {
  const memory = new Map<string, string[]>();
  const repository: Partial<MediaRepository> = {
    async getDownloadedUrls(username) { return memory.get(username) ?? []; },
    async saveDownloadedUrls(username, urls) { memory.set(username, [...urls]); },
  };
  await repository.saveDownloadedUrls?.('NASA', ['https://pbs.twimg.com/media/a.jpg']);
  assert.deepEqual(await repository.getDownloadedUrls?.('NASA'), ['https://pbs.twimg.com/media/a.jpg']);
});
