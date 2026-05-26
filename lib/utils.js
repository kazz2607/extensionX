/**
 * utils.js — Hàm tiện ích dùng chung cho extension
 */

/**
 * Format ngày tháng dạng YYYYMMDD
 */
export function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Tạo random string ngắn cho tên file
 */
export function randomStr(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}

/**
 * Delay (ms)
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Delay ngẫu nhiên trong khoảng [min, max] ms
 */
export function randomDelay(min = 1500, max = 3000) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return sleep(ms);
}

/**
 * Làm sạch username: chỉ giữ ký tự alphanum + underscore
 */
export function sanitizeUsername(username) {
  return (username || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

/**
 * Format số bytes thành chuỗi dễ đọc (KB, MB, GB)
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Lấy extension từ URL (jpg, mp4, ...)
 */
export function getExtFromUrl(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : 'jpg';
  } catch {
    return 'jpg';
  }
}

/**
 * Kiểm tra URL có phải media không
 */
export function isMediaUrl(url) {
  return /\.(jpg|jpeg|png|webp|gif|mp4|mov|m3u8)/i.test(url) ||
    url.includes('pbs.twimg.com') ||
    url.includes('video.twimg.com');
}

/**
 * Giới hạn số lượng Promise chạy song song
 */
export async function asyncPool(concurrency, iterable, iteratorFn) {
  const results = [];
  const executing = new Set();

  for (const item of iterable) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/**
 * Lấy URL ảnh chất lượng gốc từ URL ảnh Twitter
 * Thay name=small/medium/large → name=orig, thêm format=jpg
 */
export function getOriginalImageUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('name', 'orig');
    if (!u.searchParams.has('format')) {
      u.searchParams.set('format', 'jpg');
    }
    return u.toString();
  } catch {
    return url.replace(/name=\w+/, 'name=orig');
  }
}
