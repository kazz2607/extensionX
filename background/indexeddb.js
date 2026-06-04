/**
 * indexeddb.js — Wrapper for IndexedDB (v4.4.0 P4/P2)
 * Handles storage of media items, bypassing the 5MB limits of chrome.storage.local
 */

const DB_NAME = 'XMediaDownloaderDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_items';

let dbPromise = null;

export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create indexes for efficient querying
        store.createIndex('username', 'username', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
    };
  });

  return dbPromise;
}

// ─── Save Media Items (Delta Write) ──────────────────────────────────────────
export async function saveMediaItems(username, items) {
  if (!items || items.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
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
export async function getMediaItems(username) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('username');
    const request = index.getAll(username);

    request.onsuccess = () => {
      // Remove the internal 'id' property before returning to service-worker
      const items = request.result.map(item => {
        const { id, ...rest } = item;
        return rest;
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Clear Session for a Username ─────────────────────────────────────────────
export async function clearMediaItems(username) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
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
export async function clearAllMediaItems() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
