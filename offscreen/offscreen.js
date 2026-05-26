/**
 * offscreen.js — Offscreen Document (Phase 2)
 * Thêm mới:
 *   - Hỗ trợ HLS video (.m3u8) qua hls-fetcher module
 *   - Concurrency lấy từ options
 *   - Export CSV trigger
 */

if (typeof JSZip === 'undefined') {
  console.error('[Offscreen] JSZip not loaded!');
}

// ─── Load HLS Fetcher ─────────────────────────────────────────────────────────
// Import động vì offscreen.html không dùng type=module
let fetchHLS = null;

async function loadHLSFetcher() {
  if (fetchHLS) return;
  try {
    // Dynamic import the hls-fetcher as module
    const mod = await import(chrome.runtime.getURL('lib/hls-fetcher.js'));
    fetchHLS = mod.fetchHLS;
  } catch (err) {
    console.warn('[Offscreen] HLS fetcher not available:', err.message);
  }
}

loadHLSFetcher();

// ─── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'CREATE_ZIP') {
    const { username, items, options } = message.payload;
    createAndDownloadZip(username, items, options || {})
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error('[Offscreen] ZIP error:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message.type === 'EXPORT_CSV') {
    const { csv, username } = message.payload;
    triggerCSVDownload(csv, username);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// ─── Core: Create ZIP ─────────────────────────────────────────────────────────
async function createAndDownloadZip(username, items, options) {
  await loadHLSFetcher(); // đảm bảo HLS fetcher đã load

  const zip = new JSZip();
  const rootFolder = zip.folder(username);
  const imagesFolder = rootFolder.folder('images');
  const videosFolder = rootFolder.folder('videos');
  const gifsFolder   = rootFolder.folder('gifs');

  const total = items.length;
  let success = 0;
  let failed = 0;
  const failedLog = [];

  const CONCURRENCY = Math.min(Math.max(options.concurrency || 5, 1), 10);

  function reportProgress() {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      payload: {
        username,
        current: success + failed,
        total,
        success,
        failed,
        percent: Math.round(((success + failed) / total) * 100),
      }
    }).catch(() => {});
  }

  // ─── Fetch single item ──────────────────────────────────────────────────────
  async function fetchItem(item) {
    const filename = buildFilename(item);

    try {
      let blob;

      // ── HLS Video ────────────────────────────────────────────────────────────
      if (item.type === 'hls' && fetchHLS) {
        let hlsSegments = 0;
        blob = await fetchHLS(item.url, (fetched, total) => {
          hlsSegments = total;
          // Báo tiến độ HLS riêng (không thêm vào success/failed)
          chrome.runtime.sendMessage({
            type: 'HLS_PROGRESS',
            payload: { username, url: item.url, fetched, total: hlsSegments }
          }).catch(() => {});
        });

        // Đổi ext thành .ts (MPEG-TS)
        const hlsFilename = filename.replace('.m3u8', '.ts');
        videosFolder.file(hlsFilename, blob);
      }

      // ── Thường: ảnh hoặc video mp4 ──────────────────────────────────────────
      else {
        const response = await fetch(item.url, {
          credentials: 'omit',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();

        if (item.type === 'image') {
          imagesFolder.file(filename, blob);
        } else if (item.type === 'gif') {
          gifsFolder.file(filename, blob);
        } else {
          videosFolder.file(filename, blob);
        }
      }

      success++;
    } catch (err) {
      failed++;
      failedLog.push({ url: item.url, type: item.type, error: err.message });
      console.warn('[Offscreen] Failed:', item.url, err.message);
    }

    reportProgress();
  }

  // ─── Concurrent fetch ───────────────────────────────────────────────────────
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(fetchItem));
    if (i + CONCURRENCY < items.length) {
      await sleep(300);
    }
  }

  // ─── Metadata & Logs ────────────────────────────────────────────────────────
  if (failedLog.length > 0) {
    const logLines = failedLog.map(f => `${f.type}\t${f.url}\t${f.error}`);
    rootFolder.file('failed.txt',
      `# Failed downloads — ${new Date().toISOString()}\n# type\turl\terror\n\n${logLines.join('\n')}`
    );
  }

  rootFolder.file('info.json', JSON.stringify({
    username,
    downloadedAt: new Date().toISOString(),
    total, success, failed,
    images:  items.filter(i => i.type === 'image').length,
    videos:  items.filter(i => i.type === 'video').length,
    gifs:    items.filter(i => i.type === 'gif').length,
    hls:     items.filter(i => i.type === 'hls').length,
    options,
  }, null, 2));

  if (success === 0) {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_COMPLETE',
      payload: { username, success, failed, total, error: 'Không có file nào tải được' }
    });
    return;
  }

  // ─── Generate ZIP ────────────────────────────────────────────────────────────
  const ZIP_SIZE_LIMIT = 1.5 * 1024 * 1024 * 1024;

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    comment: `X Media Downloader — @${username} — ${new Date().toISOString()}`,
  }, metadata => {
    chrome.runtime.sendMessage({
      type: 'ZIP_PROGRESS',
      payload: {
        username,
        percent: Math.round(metadata.percent),
        currentFile: metadata.currentFile,
      }
    }).catch(() => {});
  });

  // Tách part nếu quá lớn
  if (zipBlob.size > ZIP_SIZE_LIMIT && options.splitZip !== false) {
    await downloadSplitZip(username, items, options);
    return;
  }

  // Download
  const dateStr = formatDate();
  const filename = `${username}_media_${dateStr}.zip`;
  triggerDownload(zipBlob, filename);

  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_COMPLETE',
    payload: { username, success, failed, total, filename }
  });
}

// ─── Split ZIP ────────────────────────────────────────────────────────────────
async function downloadSplitZip(username, items, options) {
  const PART_SIZE = 400;
  const dateStr = formatDate();
  const parts = Math.ceil(items.length / PART_SIZE);

  for (let part = 0; part < parts; part++) {
    const partItems = items.slice(part * PART_SIZE, (part + 1) * PART_SIZE);
    const partZip = new JSZip();
    const folder = partZip.folder(username);
    const imgF = folder.folder('images');
    const vidF = folder.folder('videos');
    const gifF = folder.folder('gifs');

    await Promise.all(partItems.map(async item => {
      try {
        let blob;
        if (item.type === 'hls' && fetchHLS) {
          blob = await fetchHLS(item.url, () => {});
          gifF.file(buildFilename(item).replace('.m3u8', '.ts'), blob);
        } else {
          const res = await fetch(item.url, { credentials: 'omit', cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          blob = await res.blob();
          const fn = buildFilename(item);
          if (item.type === 'image') imgF.file(fn, blob);
          else if (item.type === 'gif') gifF.file(fn, blob);
          else vidF.file(fn, blob);
        }
      } catch (_) {}
    }));

    const blob = await partZip.generateAsync({ type: 'blob', compression: 'STORE' });
    triggerDownload(blob, `${username}_media_${dateStr}_part${part + 1}of${parts}.zip`);
    await sleep(800);
  }

  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_COMPLETE',
    payload: { username, total: items.length, parts }
  });
}

// ─── CSV Download ─────────────────────────────────────────────────────────────
function triggerCSVDownload(csv, username) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${username}_media_urls_${formatDate()}.csv`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildFilename(item) {
  const base = item.tweetId || item.mediaKey || 'media';
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}_${rand}.${item.ext || 'jpg'}`;
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 15000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
