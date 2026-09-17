import { MediaItem } from '../types.ts';

const DB_NAME = 'XMediaDownloaderDB';
const DB_VERSION = 2;
const STORE_NAME = 'media_items';
const DOWNLOADED_STORE_NAME = 'downloaded_urls';
const DOWNLOADED_HISTORY_MAX_ENTRIES = 50_000;
const DOWNLOADED_HISTORY_TTL_MS = 180 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

export function initDB() {
// @ts-ignore
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
// @ts-ignore
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create indexes for efficient querying
        store.createIndex('username', 'username', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
      if (!db.objectStoreNames.contains(DOWNLOADED_STORE_NAME)) {
        const downloaded = db.createObjectStore(DOWNLOADED_STORE_NAME, { keyPath: 'id' });
        downloaded.createIndex('username', 'username', { unique: false });
        downloaded.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

// ─── Save Media Items (Delta Write) ──────────────────────────────────────────
// @ts-ignore
export async function saveMediaItems(username, items) {
  if (!items || items.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

// @ts-ignore
    items.forEach(item => {
      // Using a composite key: username + url ensures uniqueness per profile
      const id = `${username}_${item.url}`;
      store.put({ ...item, id, username });
    });

// @ts-ignore
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
      const items: MediaItem[] = request.result.map((item: any) => {
        const { id, ...rest } = item;
        return rest as MediaItem;
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Clear Session for a Username ─────────────────────────────────────────────
// @ts-ignore
export async function clearMediaItems(username) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('username');
    const request = index.getAllKeys(username);

    request.onsuccess = () => {
      const keys = request.result;
// @ts-ignore
      keys.forEach(key => store.delete(key));
    };

// @ts-ignore
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Clear Entire Database (For Factory Reset) ──────────────────────────────────
export async function clearAllMediaItems() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

// @ts-ignore
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
