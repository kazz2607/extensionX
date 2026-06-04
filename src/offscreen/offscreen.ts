// @ts-nocheck
import { fetchHLS } from '../lib/hls-fetcher.js';

// Chuyển Blob thành base64 data URL (string) để trả về service worker
// Service worker sau đó dùng chrome.downloads.download(dataUrl) — không bị lỗi cross-context
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ─── P3: FIFO Queue cho HLS — xử lý song song tối đa HLS_MAX_PARALLEL file ───
// Không thể await trong onMessage callback vì Chrome sẽ timeout sendResponse.
// Giải pháp: queue + drain, kết quả trả về qua sendMessage ngược lại SW.
const HLS_MAX_PARALLEL = 2;
const hlsQueue = [];
let hlsRunning = 0;

function enqueueHLS(requestId, url, username) {
  hlsQueue.push({ requestId, url, username });
  drainHLSQueue();
}

function drainHLSQueue() {
  while (hlsRunning < HLS_MAX_PARALLEL && hlsQueue.length > 0) {
    const task = hlsQueue.shift();
    hlsRunning++;
    processHLSTask(task).finally(() => {
      hlsRunning--;
      drainHLSQueue(); // Kéo task tiếp theo khi slot trống
    });
  }
}

async function processHLSTask({ requestId, url, username }) {
  try {
    const blob = await fetchHLS(url, (fetched, total) => {
      chrome.runtime.sendMessage({
        type: 'HLS_PROGRESS',
        payload: { username, fetched, total, requestId }
      }).catch(() => {});
    });

    const dataUrl = await blobToDataUrl(blob);

    chrome.runtime.sendMessage({
      type: 'HLS_DONE',
      requestId,
      dataUrl,
    }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'HLS_DONE',
      requestId,
      error: err.message,
    }).catch(() => {});
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  if (msg.type === 'DOWNLOAD_HLS') {
    // Đẩy vào queue (không await, không block listener)
    enqueueHLS(msg.requestId, msg.url, msg.username);
    // Xác nhận đã nhận để SW không bị timeout message
    sendResponse({ queued: true });
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
        const dataUrl = await blobToDataUrl(blob);
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
