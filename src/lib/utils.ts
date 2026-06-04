// @ts-nocheck
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
 * S4: Sanitize tên file — loại bỏ ký tự không hợp lệ trên Windows/macOS/Linux
 * - Loại bỏ: control chars (0x00–0x1F), <>:"/\|?*, null byte
 * - Thay thế bằng '_'
 * - Giới hạn 200 ký tự (NTFS limit 255, để an toàn)
 * @param {string} name - Tên file (không có đường dẫn)
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name) return 'file';
  return name
    .replace(/[\x00-\x1f\x7f]/g, '')          // control chars
    .replace(/[<>:"/\\|?*]/g, '_')             // Windows invalid chars
    .replace(/^[\s.]+|[\s.]+$/g, '')           // leading/trailing dots & spaces
    .slice(0, 200)                             // max length
    || 'file';
}

/**
 * S4: Sanitize tên thư mục — chặt hơn sanitizeFolder cơ bản
 * @param {string} folder
 * @returns {string}
 */
export function sanitizeFolder(folder) {
  if (!folder) return '';
  return folder
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"|?*\\]/g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .slice(0, 100);
}

/**
 * S2: Validate một media item đến từ CustomEvent (page-interceptor)
 * Trả về true nếu hợp lệ, false nếu dữ liệu đáng ngờ / không hợp lệ
 * @param {object} item
 * @returns {boolean}
 */
export function validateMediaItem(item) {
  if (!item || typeof item !== 'object') return false;

  // type phải nằm trong whitelist
  const VALID_TYPES = ['image', 'video', 'gif', 'hls', 'video_placeholder'];
  if (!VALID_TYPES.includes(item.type)) return false;

  // video_placeholder chỉ cần tweetId hợp lệ
  if (item.type === 'video_placeholder') {
    return /^\d{10,20}$/.test(item.tweetId || '');
  }

  // Các type còn lại phải có URL hợp lệ
  const url = item.url || '';
  if (!url.startsWith('https://pbs.twimg.com/') && !url.startsWith('https://video.twimg.com/')) {
    return false;
  }

  // tweetId nếu có phải là số
  if (item.tweetId && !/^\d{10,20}$/.test(item.tweetId)) return false;

  // ext hợp lệ
  const VALID_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'ts', 'm3u8', 'mov'];
  if (item.ext && !VALID_EXT.includes(item.ext.toLowerCase())) return false;

  return true;
}

