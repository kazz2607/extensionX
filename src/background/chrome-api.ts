export interface StorageAreaAdapter {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export function createStorageAreaAdapter(area: StorageAreaLike): StorageAreaAdapter {
  return {
    get: (keys) => area.get(keys),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

export const chromeApi = {
  storage: {
    get local(): StorageAreaAdapter { return createStorageAreaAdapter(chrome.storage.local); },
    get sync(): StorageAreaAdapter { return createStorageAreaAdapter(chrome.storage.sync); },
  },
  downloads: {
    download: (options: chrome.downloads.DownloadOptions) => chrome.downloads.download(options),
    cancel: (downloadId: number) => chrome.downloads.cancel(downloadId),
    search: (query: chrome.downloads.DownloadQuery) => chrome.downloads.search(query),
  },
};
