import { fetchHLS } from '../lib/hls-fetcher.js';
import { buildStoredZip, zipEntryName, zipPartDecision, type ZipEntry } from '../shared/zip-store.ts';

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
// Playlist HLS là văn bản, không phải video: không đưa vào ZIP (dùng tải trực tiếp).
const ZIP_URL_PATTERN = /^https:\/\/(?:pbs\.twimg\.com|video\.twimg\.com|cdn\.syndication\.twimg\.com)\/(?![^?#]*\.m3u8(?:[?#]|$))/i;
let zipRunning = false;

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isZipItem(value: unknown): value is ZipItem {
  return Boolean(value) && typeof (value as ZipItem).url === 'string';
}

interface ZipResult { archives: number; files: number; skipped: number }

async function processZipChunks(msg: OffscreenMessage): Promise<ZipResult> {
  if (zipRunning) throw new Error('A ZIP operation is already running');
  zipRunning = true;
  try {
    const username = String(msg.username || 'media').replace(/[^A-Za-z0-9_-]/g, '_');
    const chunkSize = Math.max(1, Math.min(200, Number(msg.chunkSize) || 50));
    const items = Array.isArray(msg.items) ? msg.items.slice(0, 200).filter(isZipItem) : [];
    const seenHashes = new Set<string>();
    const result: ZipResult = { archives: 0, files: 0, skipped: 0 };
    let entries: ZipEntry[] = [];
    let names = new Set<string>();
    let bytes = 0;

    // Mỗi phần tối đa chunkSize file và ZIP_MAX_BYTES: chạm giới hạn thì lưu
    // phần đang mở rồi mở phần mới — không file hợp lệ nào bị bỏ (L16).
    const flush = async () => {
      if (!entries.length) return;
      // Ảnh/video đã nén sẵn: STORE thay DEFLATE (xem shared/zip-store.ts).
      const blob = new Blob(buildStoredZip(entries), { type: 'application/zip' });
      result.archives++;
      result.files += entries.length;
      entries = [];
      names = new Set();
      bytes = 0;
      await saveBlob(blob, `${username}/zip/media_${result.archives}.zip`, username);
    };

    for (const [index, item] of items.entries()) {
      if (!ZIP_URL_PATTERN.test(item.url)) { result.skipped++; continue; }
      // Một file lỗi mạng không được làm hỏng cả lượt ZIP.
      const buffer = await fetch(item.url, { credentials: 'omit', cache: 'no-store' })
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null);
      if (!buffer) { result.skipped++; continue; }
      const decision = zipPartDecision(bytes, entries.length, buffer.byteLength, ZIP_MAX_BYTES, chunkSize);
      if (decision === 'skip') { result.skipped++; continue; }
      const hash = await sha256(buffer);
      if (seenHashes.has(hash)) continue; // nội dung trùng: không phải lỗi
      seenHashes.add(hash);
      if (decision === 'flush') await flush();
      bytes += buffer.byteLength;
      entries.push({ name: zipEntryName(item.url, item.ext, index + 1, names), data: new Uint8Array(buffer) });
    }
    await flush();
    return result;
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
    // ZIP_DONE luôn được gửi (cả khi lỗi): service worker giữ offscreen mở tới
    // khi nhận được nó, và ghi kết quả vào Notification Center.
    void processZipChunks(msg).then(
      (result) => chrome.runtime.sendMessage({ type: 'ZIP_DONE', payload: result }),
      (error: unknown) => chrome.runtime.sendMessage({ type: 'ZIP_DONE', payload: { archives: 0, files: 0, skipped: 0, error: error instanceof Error ? error.message.slice(0, 300) : 'ZIP failed' } }),
    ).catch(() => {});
    sendResponse({ queued: true });
    return false;
  }
  return false;
});
