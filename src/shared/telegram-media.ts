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
