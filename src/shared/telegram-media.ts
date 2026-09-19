import { sanitizeFilename } from './validation.ts';

export type TelegramMediaKind = 'image' | 'video';

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
};

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm']);

export function isTelegramWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'web.telegram.org';
  } catch {
    return false;
  }
}

export function telegramMediaFilename(
  kind: TelegramMediaKind,
  url: string,
  mimeType = '',
  timestamp = Date.now(),
): string {
  const allowed = kind === 'video' ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
  let extension = MIME_EXTENSIONS[mimeType.toLowerCase().split(';', 1)[0].trim()] || '';

  if (!extension) {
    try {
      const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
      const candidate = match?.[1]?.toLowerCase() || '';
      if (allowed.has(candidate)) extension = candidate === 'jpeg' ? 'jpg' : candidate;
    } catch {
      // blob/data URLs commonly have no useful pathname; use the media default.
    }
  }

  if (!extension || !allowed.has(extension)) extension = kind === 'video' ? 'mp4' : 'jpg';
  return sanitizeFilename(`telegram_${kind}_${timestamp}.${extension}`);
}

// ── Stream download (Telegram Web K `/stream/`, Web A `/progressive/`) ────────
// Video của chat riêng tư/nhóm bị hạn chế không có URL tải trực tiếp: <video>
// trỏ tới URL same-origin do Service Worker của Telegram phát lại theo từng
// đoạn `206 Partial Content`. `<a download>` trỏ thẳng vào đó nhận về 1 đoạn
// (hoặc lỗi), nên phải gọi fetch với header Range nhiều lần rồi ghép các đoạn.

const STREAM_PATH = /\/(?:stream|progressive)\//;

/** URL same-origin do Service Worker của Telegram phát theo Range (không phải blob:/CDN). */
export function isTelegramStreamUrl(value: unknown): value is string {
  if (!isTelegramWebUrl(value)) return false;
  try {
    return STREAM_PATH.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export interface ContentRange {
  start: number;
  end: number;
  /** Tổng dung lượng; null khi server trả `*` (không biết). */
  total: number | null;
}

/** Parse header `Content-Range: bytes 0-524287/1048576`. Trả null nếu sai định dạng. */
export function parseContentRange(header: string | null | undefined): ContentRange | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec((header ?? '').trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === '*' ? null : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  if (total !== null && (!Number.isSafeInteger(total) || end >= total)) return null;
  return { start, end, total };
}

/** Đuôi file từ MIME của response; rơi về mp4 cho video không nhận ra. */
export function streamFileExtension(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType.toLowerCase().split(';', 1)[0].trim()] || 'mp4';
}
