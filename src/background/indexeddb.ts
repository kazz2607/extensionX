import type { MediaItem } from '../types.ts';
import type { MediaRepository } from './media-repository.ts';

const DB_NAME = 'XMediaDownloaderDB';
export const DB_VERSION = 3;
const STORE_NAME = 'media_items';
const DOWNLOADED_STORE_NAME = 'downloaded_urls';
const META_STORE_NAME = 'schema_meta';
const DOWNLOADED_HISTORY_MAX_ENTRIES = 50_000;
const DOWNLOADED_HISTORY_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MEDIA_RETENTION_MAX_ENTRIES = 50_000;
const MEDIA_RETENTION_TTL_MS = 180 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

export type DatabaseMigration = 1 | 2 | 3;

/** Pure migration plan used by tests and by onupgradeneeded. */
export function getDatabaseMigrationPlan(oldVersion: number): DatabaseMigration[] {
  const steps: DatabaseMigration[] = [];
  if (oldVersion < 1) steps.push(1);
  if (oldVersion < 2) steps.push(2);
  if (oldVersion < 3) steps.push(3);
  return steps;
}

function applyDatabaseMigrations(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  for (const step of getDatabaseMigrationPlan(oldVersion)) {
    if (step === 1 && !db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('username', 'username', { unique: false });
      store.createIndex('url', 'url', { unique: false });
    }
    if (step === 2 && !db.objectStoreNames.contains(DOWNLOADED_STORE_NAME)) {
      const downloaded = db.createObjectStore(DOWNLOADED_STORE_NAME, { keyPath: 'id' });
      downloaded.createIndex('username', 'username', { unique: false });
      downloaded.createIndex('addedAt', 'addedAt', { unique: false });
    }
    if (step === 3) {
      const meta = db.objectStoreNames.contains(META_STORE_NAME)
        ? transaction.objectStore(META_STORE_NAME)
        : db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
      meta.put({ key: 'schemaVersion', value: DB_VERSION, migratedAt: Date.now() });
    }
  }
}

export function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!request.transaction) throw new Error('IndexedDB upgrade transaction unavailable');
      applyDatabaseMigrations(db, request.transaction, event.oldVersion);
    };
  });

  return dbPromise;
}

// ─── Save Media Items (Delta Write) ──────────────────────────────────────────
export async function saveMediaItems(username: string, items: MediaItem[]): Promise<void> {
  if (!items || items.length === 0) return;
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    items.forEach(item => {
      // Using a composite key: username + url ensures uniqueness per profile
      const id = `${username}_${item.url}`;
      store.put({ ...item, id, username });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Get All Media Items for a Username ────────────────────────────────────────
export async function getMediaItems(username: string): Promise<MediaItem[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('username');
    const request = index.getAll(username);

    request.onsuccess = () => {
      // Remove the internal 'id' property before returning to service-worker
      const items: MediaItem[] = (request.result as Array<MediaItem & { id: string }>).map((item) => {
        const { id, ...rest } = item;
        return rest;
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Streams one profile through an IndexedDB cursor without creating a getAll() result array. */
export async function visitMediaItems(username: string, visitor: (item: MediaItem) => void): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('username').openCursor(IDBKeyRange.only(username));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const { id: _id, ...item } = cursor.value as MediaItem & { id: string };
      visitor(item);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Media cursor transaction aborted'));
  });
}

export async function pruneMediaItems(username: string, now = Date.now(), maxEntries = MEDIA_RETENTION_MAX_ENTRIES, ttlMs = MEDIA_RETENTION_TTL_MS): Promise<number> {
  const db = await initDB();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.index('username').getAll(username);
    let removed = 0;
    request.onsuccess = () => {
      const records = request.result as Array<MediaItem & { id: string; addedAt?: number }>;
      const expiresBefore = now - ttlMs;
      const expired = records.filter((record) => Number(record.addedAt) > 0 && Number(record.addedAt) < expiresBefore);
      const retained = records.filter((record) => !expired.includes(record)).sort((a, b) => Number(a.addedAt || 0) - Number(b.addedAt || 0));
      const overflow = retained.slice(0, Math.max(0, retained.length - maxEntries));
      for (const record of [...expired, ...overflow]) { store.delete(record.id); removed++; }
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Media retention transaction aborted'));
  });
}

// ─── Clear Session for a Username ─────────────────────────────────────────────
export async function clearMediaItems(username: string): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('username');
    const request = index.getAllKeys(username);

    request.onsuccess = () => {
      const keys = request.result;
      keys.forEach(key => store.delete(key));
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Clear Entire Database (For Factory Reset) ──────────────────────────────────
export async function clearAllMediaItems(): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ─── Downloaded URL index ───────────────────────────────────────────────────
// Keep duplicate history in IndexedDB instead of chrome.storage.local. The
// latter is quota-bound and serializes the entire URL list on every update.
interface DownloadedUrlRecord {
  id: string;
  username: string;
  url: string;
  addedAt: number;
}

export async function getDownloadedUrls(username: string): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readonly');
    const request = tx.objectStore(DOWNLOADED_STORE_NAME).index('username').getAll(username);
    request.onsuccess = () => resolve((request.result as DownloadedUrlRecord[]).map((item) => item.url));
    request.onerror = () => reject(request.error);
  });
}

// Pha 14: bản đầy đủ (kèm addedAt) cho Manifest export — getDownloadedUrls() ở
// trên chỉ trả url vì đó là tất cả dedup cần, không đổi hàm đó để tránh ảnh hưởng
// các call site hiện có.
export async function getDownloadedUrlRecords(username: string): Promise<Array<{ url: string; addedAt: number }>> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readonly');
    const request = tx.objectStore(DOWNLOADED_STORE_NAME).index('username').getAll(username);
    request.onsuccess = () => resolve((request.result as DownloadedUrlRecord[]).map((item) => ({ url: item.url, addedAt: item.addedAt })));
    request.onerror = () => reject(request.error);
  });
}

export async function visitDownloadedUrlRecords(username: string, visitor: (entry: { url: string; addedAt: number }) => void): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readonly');
    const request = tx.objectStore(DOWNLOADED_STORE_NAME).index('username').openCursor(IDBKeyRange.only(username));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as DownloadedUrlRecord;
      visitor({ url: record.url, addedAt: record.addedAt });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Downloaded URL cursor transaction aborted'));
  });
}

export async function saveDownloadedUrls(username: string, urls: Iterable<string>): Promise<void> {
  const entries = [...urls];
  if (!entries.length) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DOWNLOADED_STORE_NAME);
    const addedAt = Date.now();
    for (const url of entries) store.put({ id: `${username}:${url}`, username, url, addedAt } satisfies DownloadedUrlRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Downloaded URL transaction aborted'));
  });
}

/** Bound duplicate history so a long-lived profile cannot grow IndexedDB forever. */
export async function pruneDownloadedUrls(
  username: string,
  now = Date.now(),
  maxEntries = DOWNLOADED_HISTORY_MAX_ENTRIES,
  ttlMs = DOWNLOADED_HISTORY_TTL_MS,
): Promise<number> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DOWNLOADED_STORE_NAME);
    const request = store.index('username').getAll(username);
    let removed = 0;
    request.onsuccess = () => {
      const records = request.result as DownloadedUrlRecord[];
      const expiresBefore = now - ttlMs;
      const expired = records.filter((record) => record.addedAt < expiresBefore);
      const retained = records.filter((record) => record.addedAt >= expiresBefore).sort((a, b) => a.addedAt - b.addedAt);
      const overflow = retained.slice(0, Math.max(0, retained.length - maxEntries));
      for (const record of [...expired, ...overflow]) {
        store.delete(record.id);
        removed++;
      }
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Downloaded URL prune transaction aborted'));
  });
}

export async function clearDownloadedUrls(username: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DOWNLOADED_STORE_NAME);
    const request = store.index('username').openKeyCursor(IDBKeyRange.only(username));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllDownloadedUrls(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE_NAME, 'readwrite');
    const request = tx.objectStore(DOWNLOADED_STORE_NAME).clear();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const mediaRepository: MediaRepository = {
  saveMediaItems,
  getMediaItems,
  visitMediaItems,
  pruneMediaItems,
  clearMediaItems,
  clearAllMediaItems,
  getDownloadedUrls,
  getDownloadedUrlRecords,
  visitDownloadedUrlRecords,
  saveDownloadedUrls,
  pruneDownloadedUrls,
  clearDownloadedUrls,
  clearAllDownloadedUrls,
};
