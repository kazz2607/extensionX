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
export async function fetchHLS(m3u8Url, onProgress) {
  // 1. Fetch file playlist .m3u8
  const playlistText = await fetchText(m3u8Url);
  if (!playlistText) throw new Error('Cannot fetch HLS playlist');

  // 2. Parse — có thể là master playlist hoặc media playlist
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

  // Nếu là master playlist (chứa #EXT-X-STREAM-INF), lấy stream bitrate cao nhất
  if (playlistText.includes('#EXT-X-STREAM-INF')) {
    const mediaPlaylistUrl = extractBestStream(playlistText, baseUrl);
    // BUG-6 FIX: Guard null — nếu không tìm thấy stream hợp lệ thì throw rõ ràng
    if (!mediaPlaylistUrl) throw new Error('No valid HLS stream found in master playlist');
    return fetchHLS(mediaPlaylistUrl, onProgress); // Đệ quy lấy media playlist
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
          const res = await fetch(segUrl, { credentials: 'include', cache: 'no-store' });
          if (!res.ok) throw new Error(`Segment HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          fetched++;
          onProgress?.(fetched, segments.length);
          return { idx, buf };
        } catch (err) {
          console.warn('[HLS] Failed segment:', segUrl, err.message);
          fetched++;
          onProgress?.(fetched, segments.length);
          return { idx, buf: null };
        }
      })
    );

    batchResults.forEach(({ idx, buf }) => {
      if (buf) blobs[idx] = buf;
    });
  }

  // 5. Concatenate tất cả ArrayBuffer thành một Blob
  const validBuffers = blobs.filter(Boolean);
  if (!validBuffers.length) throw new Error('All HLS segments failed');

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

async function fetchText(url) {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/**
 * Parse master playlist, trả về URL của stream có bandwidth cao nhất
 */
function extractBestStream(text, baseUrl) {
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
function parseSegments(text, baseUrl) {
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

function resolveUrl(url, baseUrl) {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.origin}${url}`;
  }
  return baseUrl + url;
}
