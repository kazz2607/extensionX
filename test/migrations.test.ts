import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageAreaAdapter } from '../src/background/chrome-api.ts';
import { DB_VERSION, getDatabaseMigrationPlan } from '../src/background/indexeddb.ts';
import type { MediaRepository } from '../src/background/media-repository.ts';
import { migrateOptionsStorage, migrateQueueStorage, OPTIONS_SCHEMA_VERSION, QUEUE_SCHEMA_VERSION } from '../src/shared/storage-migrations.ts';

test('migrates legacy Options without losing user values', () => {
  const migrated = migrateOptionsStorage({ _version: '5.7.0', concurrency: 5, localDiagnostics: true });
  assert.equal(migrated.schemaVersion, OPTIONS_SCHEMA_VERSION);
  assert.equal(migrated.concurrency, 5);
  assert.equal(migrated.localDiagnostics, true);
  assert.equal('_version' in migrated, false);
});

test('migrates Queue raw arrays and versioned snapshots to schema v2', () => {
  const legacyItem = {
    id: 'NASA_1', username: 'NASA', filterType: 'all', skipDuplicates: true,
    addedAt: 1, status: 'downloading', mediaCount: 2, result: null,
  };
  const legacy = migrateQueueStorage([legacyItem]);
  assert.equal(legacy.schemaVersion, QUEUE_SCHEMA_VERSION);
  assert.equal(legacy.items[0]?.status, 'waiting');

  const current = migrateQueueStorage({ schemaVersion: 2, items: [{ ...legacyItem, status: 'waiting' }] });
  assert.equal(current.items.length, 1);
  assert.deepEqual(migrateQueueStorage({ schemaVersion: 99, items: 'broken' }).items, []);
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
