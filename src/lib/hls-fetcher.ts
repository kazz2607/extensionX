/**
 * hls-fetcher.js — Xử lý video HLS (.m3u8)
 * Fetch playlist → parse TS segments → concatenate → trả về Blob mp4/ts
 *
 * Chạy trong OFFSCREEN context (có DOM, fetch)
 */

/**
 * Fetch một video HLS và trả về Blob
 * @param {string} m3u8Url - URL của file .m3u8
 * @param {function} onProgress - callback(fetched, total)
 * @returns {Promise<Blob>}
 */
// @ts-ignore
export async function fetchHLS(
  m3u8Url: string,
  onProgress?: (fetched: number, total: number) => void,
  options: { signal?: AbortSignal } = {},
) {
  const signal = options.signal;
  throwIfAborted(signal);
  // 1. Fetch file playlist .m3u8
  const playlistText = await fetchText(m3u8Url, signal);
  if (!playlistText) throw new Error('Cannot fetch HLS playlist');

  // 2. Parse — có thể là master playlist hoặc media playlist
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

  // Nếu là master playlist (chứa #EXT-X-STREAM-INF), lấy stream bitrate cao nhất
  if (playlistText.includes('#EXT-X-STREAM-INF')) {
    const mediaPlaylistUrl = extractBestStream(playlistText, baseUrl);
    // BUG-6 FIX: Guard null — nếu không tìm thấy stream hợp lệ thì throw rõ ràng
    if (!mediaPlaylistUrl) throw new Error('No valid HLS stream found in master playlist');
    return fetchHLS(mediaPlaylistUrl, onProgress, { signal }); // Đệ quy lấy media playlist
  }

  // 3. Parse media playlist — lấy danh sách TS segments
  const segments = parseSegments(playlistText, baseUrl);
  if (!segments.length) throw new Error('No segments found in HLS playlist');

  // 4. Fetch từng segment song song (max 8 — P3 tăng từ 4)
  const CONCURRENCY = 8;
  const blobs = new Array(segments.length);
  let fetched = 0;

  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    const batch = segments.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (segUrl, batchIdx) => {
        const idx = i + batchIdx;
        try {
          const res = await fetchWithRetry(segUrl, signal);
          const buf = await res.arrayBuffer();
          throwIfAborted(signal);
          fetched++;
          onProgress?.(fetched, segments.length);
          return { idx, buf };
        } catch (err) { throw err; }
      })
    );

    batchResults.forEach(({ idx, buf }) => {
      if (buf) blobs[idx] = buf;
    });
  }

  // 5. Concatenate tất cả ArrayBuffer thành một Blob
  const validBuffers = blobs.filter(Boolean);
  if (validBuffers.length !== segments.length) throw new Error('HLS segment download incomplete');

  const totalSize = validBuffers.reduce((s, b) => s + b.byteLength, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const buf of validBuffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return new Blob([combined], { type: 'video/mp4' }); // Ép kiểu mp4 để Chrome không tự đổi thành .txt
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// @ts-ignore
async function fetchText(url: string, signal?: AbortSignal) {
  try {
    const res = await fetchWithRetry(url, signal);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// Network responses can be transient on X's video CDN. Retry only bounded
// network/5xx failures and let AbortController end both a retry wait and fetch.
async function fetchWithRetry(url: string, signal?: AbortSignal, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) throw new Error(`Segment HTTP ${response.status}`);
      lastError = new Error(`Segment HTTP ${response.status}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof Error && /^Segment HTTP 4\d\d$/.test(error.message)) throw error;
      lastError = error;
    }
    if (attempt < maxAttempts - 1) await abortableDelay(300 * (2 ** attempt) + Math.floor(Math.random() * 150), signal);
  }
  throw lastError || new Error('HLS request failed');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError');
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', aborted); resolve(); }
    function aborted() { clearTimeout(timer); reject(new DOMException('Download cancelled', 'AbortError')); }
    if (signal) signal.addEventListener('abort', aborted, { once: true });
  });
}

/**
 * Parse master playlist, trả về URL của stream có bandwidth cao nhất
 */
// @ts-ignore
function extractBestStream(text, baseUrl) {
// @ts-ignore
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let bestBandwidth = -1;
  let bestUrl = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
      const bw = bwMatch ? parseInt(bwMatch[1]) : 0;
      const url = lines[i + 1];
      if (url && !url.startsWith('#') && bw >= bestBandwidth) {
        bestBandwidth = bw;
        bestUrl = resolveUrl(url, baseUrl);
      }
    }
  }

  return bestUrl;
}

/**
 * Parse media playlist, trả về mảng URL của các TS segment
 */
// @ts-ignore
function parseSegments(text, baseUrl) {
// @ts-ignore
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const segments = [];

  for (const line of lines) {
    if (!line.startsWith('#') && (line.endsWith('.ts') || line.includes('.ts?') || line.match(/\.(ts|aac|mp4)(\?|$)/i))) {
      segments.push(resolveUrl(line, baseUrl));
    }
  }

  // Fallback: lấy tất cả dòng không phải comment và không có extension rõ ràng
  if (!segments.length) {
    for (const line of lines) {
      if (!line.startsWith('#') && (line.startsWith('http') || !line.includes('.'))) {
        segments.push(resolveUrl(line, baseUrl));
      }
    }
  }

  return segments;
}

// @ts-ignore
function resolveUrl(url, baseUrl) {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.origin}${url}`;
  }
  return baseUrl + url;
}
