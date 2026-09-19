/**
 * Telegram Web — tải video dạng stream (chạy trong MAIN world của trang).
 *
 * Video của chat riêng tư/nhóm bị hạn chế chỉ tồn tại dưới dạng URL same-origin
 * (`/k/stream/…`, `/a/progressive/…`) do Service Worker của Telegram phát lại
 * theo từng đoạn `206 Partial Content`. Chỉ fetch chạy trong chính trang mới đi
 * qua Service Worker đó, và `<a download>` trỏ vào URL này chỉ nhận về 1 đoạn.
 * Script này gọi fetch với header Range liên tiếp, ghép các đoạn thành Blob rồi
 * lưu file. Tiến độ/kết quả báo ngược về tg-content.ts (isolated world) qua
 * CustomEvent — không cần đi qua service worker của extension, nên không bị
 * giới hạn tuổi thọ SW khi video dài.
 */
import { isRetryableChunkStatus, isTelegramStreamUrl, parseContentRange, streamFileExtension } from '../shared/telegram-media.ts';

const REQUEST_EVENT = 'XMD_TG_STREAM_DOWNLOAD';
const STATUS_EVENT = 'XMD_TG_STREAM_STATUS';
const CHUNK_RETRIES = 6;

interface StreamRequest {
  id: string;
  url: string;
  filename: string;
}

type StreamStatus =
  | { id: string; state: 'started' }
  | { id: string; state: 'progress'; received: number; total: number | null }
  | { id: string; state: 'done'; received: number; total: number | null }
  | { id: string; state: 'error'; message: string };

const activeUrls = new Set<string>();

function emit(status: StreamStatus): void {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
}

function isStreamRequest(value: unknown): value is StreamRequest {
  if (typeof value !== 'object' || value === null) return false;
  const req = value as Record<string, unknown>;
  return typeof req.id === 'string' && req.id.length <= 64
    && typeof req.url === 'string' && req.url.length <= 8_192
    && typeof req.filename === 'string' && req.filename.length <= 200;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Tải 1 đoạn Range, thử lại khi lỗi mạng hoặc HTTP tạm thời (408/425/429/5xx). */
async function fetchChunk(url: string, offset: number): Promise<Response> {
  let lastError: Error = new Error('Không tải được đoạn video');
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-` } });
      if (res.status === 200 || res.status === 206) return res;
      lastError = new Error(`HTTP ${res.status}`);
      // 408/425/429/5xx là tạm thời (Telegram trả 408 khi đoạn hết thời gian chờ); 4xx khác thì không.
      if (!isRetryableChunkStatus(res.status)) break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(500 * (attempt + 1));
  }
  throw lastError;
}

async function collectStream(
  req: StreamRequest,
): Promise<{ blob: Blob; mime: string; received: number; total: number | null }> {
  const parts: Blob[] = [];
  let offset = 0;
  let total: number | null = null;
  let mime = '';

  for (;;) {
    const res = await fetchChunk(req.url, offset);
    if (!mime) mime = (res.headers.get('Content-Type') || '').split(';', 1)[0].trim();

    if (res.status === 200) {
      // Server bỏ qua Range và trả cả file — chỉ hợp lệ khi đang ở đầu file.
      if (offset !== 0) throw new Error('Phản hồi không hỗ trợ Range giữa chừng');
      const whole = await res.blob();
      parts.push(whole);
      offset = whole.size;
      total = whole.size;
      emit({ id: req.id, state: 'progress', received: offset, total });
      break;
    }

    const range = parseContentRange(res.headers.get('Content-Range'));
    if (!range || range.start !== offset) throw new Error('Content-Range không hợp lệ');
    if (range.total === null) throw new Error('Không xác định được dung lượng video');
    if (total !== null && range.total !== total) throw new Error('Dung lượng video thay đổi giữa chừng');
    total = range.total;

    const chunk = await res.blob();
    if (chunk.size !== range.end - range.start + 1) throw new Error('Đoạn video bị cắt cụt');
    parts.push(chunk);
    offset = range.end + 1;
    emit({ id: req.id, state: 'progress', received: offset, total });
    if (offset >= total) break;
  }

  return { blob: new Blob(parts, { type: mime || 'video/mp4' }), mime, received: offset, total };
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  // Router SPA của Telegram có thể preventDefault() click same-origin.
  a.addEventListener('click', (e) => e.stopPropagation());
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 2_000);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function handleRequest(req: StreamRequest): Promise<void> {
  if (!isTelegramStreamUrl(req.url) || new URL(req.url).origin !== location.origin) {
    emit({ id: req.id, state: 'error', message: 'URL stream không hợp lệ' });
    return;
  }
  if (activeUrls.has(req.url)) {
    emit({ id: req.id, state: 'error', message: 'Video này đang được tải' });
    return;
  }

  activeUrls.add(req.url);
  // Báo ngay để phía isolated biết script đã nhận yêu cầu (chunk đầu có thể chậm).
  emit({ id: req.id, state: 'started' });
  try {
    const { blob, mime, received, total } = await collectStream(req);
    const base = req.filename.replace(/\.[a-z0-9]{2,5}$/i, '');
    saveBlob(blob, `${base}.${streamFileExtension(mime)}`);
    emit({ id: req.id, state: 'done', received, total });
  } catch (err) {
    emit({ id: req.id, state: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    activeUrls.delete(req.url);
  }
}

window.addEventListener(REQUEST_EVENT, (event) => {
  const detail = (event as CustomEvent<unknown>).detail;
  if (isStreamRequest(detail)) void handleRequest(detail);
});
