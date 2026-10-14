import { fetchHLS } from '../lib/hls-fetcher.js';

interface ZipArchive {
  file(name: string, data: ArrayBuffer): void;
  generateAsync(options: { type: 'blob'; compression: 'DEFLATE'; compressionOptions: { level: number }; streamFiles: boolean }): Promise<Blob>;
}

interface ZipItem { url: string; ext?: string }

interface HlsTask {
  requestId: string;
  url: string;
  username: string;
  filename: string;
  controller: AbortController;
}

interface OffscreenMessage {
  target?: string;
  type?: string;
  requestId?: string;
  url?: string;
  username?: string;
  filename?: string;
  items?: unknown;
  chunkSize?: unknown;
}

// Offscreen documents only get chrome.runtime, so chrome.downloads must run in
// the service worker. The object URL stays alive here until the SW reports the
// Chrome download as finished, then it is revoked.
async function saveBlob(blob: Blob, filename: string, username: string): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_SAVE_BLOB',
      payload: { url, filename, username },
    }) as { downloadId?: number; error?: string } | undefined;
    if (!response?.downloadId) throw new Error(response?.error || 'No downloadId returned');
    return response.downloadId;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ZIP_MAX_BYTES = 500 * 1024 * 1024;
let zipRunning = false;

function zipFilename(item: ZipItem, index: number): string {
  const raw = item.url.split('/').pop()?.split('?')[0] || `media_${index}.${item.ext || 'bin'}`;
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isZipItem(value: unknown): value is ZipItem {
  return Boolean(value) && typeof (value as ZipItem).url === 'string';
}

async function processZipChunks(msg: OffscreenMessage) {
  if (zipRunning) throw new Error('A ZIP operation is already running');
  zipRunning = true;
  try {
    // P14: JSZip (~100 KB) loads only for ZIP work, not on every offscreen
    // start for HLS. The UMD bundle registers itself on globalThis.
    await import('../lib/jszip.min.ts');
    const JSZip = (globalThis as unknown as { JSZip: new () => ZipArchive }).JSZip;
    const username = String(msg.username || 'media').replace(/[^A-Za-z0-9_-]/g, '_');
    const chunkSize = Math.max(1, Math.min(200, Number(msg.chunkSize) || 50));
    const items = Array.isArray(msg.items) ? msg.items.slice(0, 200).filter(isZipItem) : [];
    const seenHashes = new Set<string>();
    for (let start = 0; start < items.length; start += chunkSize) {
      const zip = new JSZip();
      let bytes = 0;
      let added = 0;
      const chunk = items.slice(start, start + chunkSize);
      for (let index = 0; index < chunk.length; index++) {
        const item = chunk[index];
        if (!/^https:\/\/(?:pbs\.twimg\.com|video\.twimg\.com|cdn\.syndication\.twimg\.com)\//i.test(item.url)) continue;
        const response = await fetch(item.url, { credentials: 'omit', cache: 'no-store' });
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        if (bytes + buffer.byteLength > ZIP_MAX_BYTES) break;
        const hash = await sha256(buffer);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        bytes += buffer.byteLength;
        added++;
        zip.file(zipFilename(item, start + index + 1), buffer);
      }
      if (!added) continue;
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 }, streamFiles: true });
      await saveBlob(blob, `${username}/zip/media_${Math.floor(start / chunkSize) + 1}.zip`, username);
      chrome.runtime.sendMessage({ type: 'ZIP_PROGRESS', payload: { completed: Math.min(start + chunkSize, items.length), total: items.length } }).catch(() => {});
    }
  } finally {
    zipRunning = false;
  }
}

// ─── P3: FIFO Queue cho HLS — xử lý song song tối đa HLS_MAX_PARALLEL file ───
// Không thể await trong onMessage callback vì Chrome sẽ timeout sendResponse.
// Giải pháp: queue + drain, kết quả trả về qua sendMessage ngược lại SW.
const HLS_MAX_PARALLEL = 2;
const hlsQueue: HlsTask[] = [];
const hlsTasks = new Map<string, HlsTask>();
let hlsRunning = 0;

function enqueueHLS(requestId: string, url: string, username: string, filename: string) {
  const task: HlsTask = { requestId, url, username, filename, controller: new AbortController() };
  hlsTasks.set(requestId, task);
  hlsQueue.push(task);
  drainHLSQueue();
}

function drainHLSQueue() {
  while (hlsRunning < HLS_MAX_PARALLEL && hlsQueue.length > 0) {
    const task = hlsQueue.shift()!;
    hlsRunning++;
    processHLSTask(task).finally(() => {
      hlsTasks.delete(task.requestId);
      hlsRunning--;
      drainHLSQueue(); // Kéo task tiếp theo khi slot trống
    });
  }
}

async function processHLSTask(task: HlsTask) {
  const { requestId, url, username, filename, controller } = task;
  try {
    const blob = await fetchHLS(url, (fetched, total) => {
      chrome.runtime.sendMessage({
        type: 'HLS_PROGRESS',
        payload: { username, fetched, total, requestId }
      }).catch(() => {});
    }, { signal: controller.signal });

    if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
    const downloadId = await saveBlob(blob, filename, username);

    chrome.runtime.sendMessage({
      type: 'HLS_DONE',
      requestId,
      downloadId,
    }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'HLS_DONE',
      requestId,
      error: err instanceof Error ? err.message : 'HLS download failed',
    }).catch(() => {});
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────
// Only the service worker (an extension context without a page or tab) may
// drive offscreen work; popup/options pages and content scripts may not.
function isServiceWorkerSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && !sender.tab &&
    Boolean(sender.url?.startsWith(chrome.runtime.getURL(''))) && !sender.url?.endsWith('.html');
}

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, sender, sendResponse) => {
  if (!isServiceWorkerSender(sender) || msg.target !== 'offscreen') return false;

  if (msg.type === 'DOWNLOAD_HLS') {
    if (typeof msg.requestId !== 'string' || typeof msg.url !== 'string' || typeof msg.filename !== 'string') {
      sendResponse({ queued: false });
      return false;
    }
    // Đẩy vào queue (không await, không block listener)
    enqueueHLS(msg.requestId, msg.url, String(msg.username || ''), msg.filename);
    // Xác nhận đã nhận để SW không bị timeout message
    sendResponse({ queued: true });
    return false;
  }

  if (msg.type === 'CANCEL_HLS') {
    // A Chrome download already started from this task is cancelled by the SW
    // through its activeDownloads registry.
    const task = typeof msg.requestId === 'string' ? hlsTasks.get(msg.requestId) : undefined;
    if (task) {
      task.controller.abort();
      const queuedIndex = hlsQueue.indexOf(task);
      if (queuedIndex >= 0) {
        hlsQueue.splice(queuedIndex, 1);
        hlsTasks.delete(task.requestId);
      }
    }
    sendResponse({ cancelled: Boolean(task) });
    return false;
  }

  if (msg.type === 'DOWNLOAD_ZIP_CHUNKS') {
    void processZipChunks(msg).catch((error) => {
      chrome.runtime.sendMessage({ type: 'ZIP_FAILED', payload: { error: error instanceof Error ? error.message : 'ZIP failed' } }).catch(() => {});
    });
    sendResponse({ queued: true });
    return false;
  }
  return false;
});
