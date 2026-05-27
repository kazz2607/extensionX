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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  if (msg.type === 'DOWNLOAD_HLS') {
    (async () => {
      try {
        const blob = await fetchHLS(msg.url, (fetched, total) => {
          chrome.runtime.sendMessage({
            type: 'HLS_PROGRESS',
            payload: { username: msg.username, fetched, total }
          }).catch(() => {});
        });

        const dataUrl = await blobToDataUrl(blob);
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
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
