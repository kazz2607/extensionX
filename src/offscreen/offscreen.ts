// @ts-nocheck
import { fetchHLS } from '../lib/hls-fetcher.js';
import '../lib/jszip.min.ts';

function downloadBlob(blob, filename, task) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    chrome.downloads.download({ url: blobUrl, filename, conflictAction: 'uniquify', saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || !downloadId) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(chrome.runtime.lastError?.message || 'No downloadId returned'));
        return;
      }
      task.downloadId = downloadId;
      const listener = (delta) => {
        if (delta.id !== downloadId || !delta.state) return;
        if (delta.state.current !== 'complete' && delta.state.current !== 'interrupted') return;
        chrome.downloads.onChanged.removeListener(listener);
        URL.revokeObjectURL(blobUrl);
        task.downloadId = undefined;
        if (delta.state.current === 'complete') resolve(downloadId);
        else reject(new Error(delta.error?.current || 'Download interrupted'));
      };
      chrome.downloads.onChanged.addListener(listener);
    });
  });
}

const ZIP_MAX_BYTES = 500 * 1024 * 1024;
let zipRunning = false;

function zipFilename(item, index) {
  const raw = item.url.split('/').pop()?.split('?')[0] || `media_${index}.${item.ext || 'bin'}`;
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function processZipChunks(msg) {
  if (zipRunning) throw new Error('A ZIP operation is already running');
  zipRunning = true;
  try {
    const chunkSize = Math.max(1, Math.min(200, Number(msg.chunkSize) || 50));
    const items = Array.isArray(msg.items) ? msg.items.slice(0, 200) : [];
    const seenHashes = new Set();
    for (let start = 0; start < items.length; start += chunkSize) {
      const zip = new globalThis.JSZip();
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
      await downloadBlob(blob, `${String(msg.username || 'media').replace(/[^A-Za-z0-9_-]/g, '_')}/zip/media_${Math.floor(start / chunkSize) + 1}.zip`, {});
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
const hlsQueue = [];
const hlsTasks = new Map();
let hlsRunning = 0;

function enqueueHLS(requestId, url, username, filename) {
  const task = { requestId, url, username, filename, controller: new AbortController(), downloadId: undefined };
  hlsTasks.set(requestId, task);
  hlsQueue.push(task);
  drainHLSQueue();
}

function drainHLSQueue() {
  while (hlsRunning < HLS_MAX_PARALLEL && hlsQueue.length > 0) {
    const task = hlsQueue.shift();
    hlsRunning++;
    processHLSTask(task).finally(() => {
      hlsTasks.delete(task.requestId);
      hlsRunning--;
      drainHLSQueue(); // Kéo task tiếp theo khi slot trống
    });
  }
}

async function processHLSTask(task) {
  const { requestId, url, username, filename, controller } = task;
  try {
    const blob = await fetchHLS(url, (fetched, total) => {
      chrome.runtime.sendMessage({
        type: 'HLS_PROGRESS',
        payload: { username, fetched, total, requestId }
      }).catch(() => {});
    }, { signal: controller.signal });

    if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
    const downloadId = await downloadBlob(blob, filename, task);

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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== 'offscreen') return false;

  if (msg.type === 'DOWNLOAD_HLS') {
    // Đẩy vào queue (không await, không block listener)
    enqueueHLS(msg.requestId, msg.url, msg.username, msg.filename);
    // Xác nhận đã nhận để SW không bị timeout message
    sendResponse({ queued: true });
    return false;
  }

  if (msg.type === 'CANCEL_HLS') {
    const task = hlsTasks.get(msg.requestId);
    if (task) {
      task.controller.abort();
      if (task.downloadId) chrome.downloads.cancel(task.downloadId).catch(() => {});
      const queuedIndex = hlsQueue.indexOf(task);
      if (queuedIndex >= 0) {
        hlsQueue.splice(queuedIndex, 1);
        hlsTasks.delete(msg.requestId);
      }
    }
    sendResponse({ cancelled: Boolean(task) });
    return false;
  }

  if (msg.type === 'DOWNLOAD_MP4') {
    (async () => {
      try {
        const res = await fetch(msg.url, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
          throw new Error('Server trả về định dạng chữ thay vì video (Bị chặn 403).');
        }

        const contentLength = res.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = res.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;

            chrome.runtime.sendMessage({
              type: 'MP4_FETCH_PROGRESS',
              payload: { username: msg.username, bytesReceived: loaded, total }
            }).catch(() => {});
          }
        }

        if (chunks.length === 0) {
          throw new Error('Server trả về file rỗng (0 bytes).');
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
        const task = { downloadId: undefined };
        const downloadId = await downloadBlob(blob, msg.filename, task);
        sendResponse({ ok: true, downloadId });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'DOWNLOAD_ZIP_CHUNKS') {
    void processZipChunks(msg).catch((error) => {
      chrome.runtime.sendMessage({ type: 'ZIP_FAILED', payload: { error: error instanceof Error ? error.message : 'ZIP failed' } }).catch(() => {});
    });
    sendResponse({ queued: true });
    return false;
  }
});
