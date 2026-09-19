import type { ExtensionMessage } from '../shared/messages';
import {
  isTelegramStreamUrl,
  parseTelegramStreamInfo,
  pickLatestVideoStreamUrl,
  telegramMediaFilename,
  type StreamRequestRecord,
  type TelegramMediaKind,
} from '../shared/telegram-media.ts';

console.log('[ExtensionX] Telegram Web Content Script loaded.');

const VIEWER_SELECTOR = '.media-viewer-whole, #MediaViewer';

function createDownloadIcon(): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z');
  svg.appendChild(path);
  return svg;
}

function mediaUrl(element: HTMLElement): string {
  if (element instanceof HTMLImageElement) return element.currentSrc || element.src;
  if (element instanceof HTMLVideoElement) {
    return element.currentSrc || element.src || element.querySelector('source[src]')?.getAttribute('src') || '';
  }
  const backgroundImage = getComputedStyle(element).backgroundImage;
  const backgroundUrl = backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
  if (backgroundUrl) return backgroundUrl;
  return '';
}

function mediaMimeType(element: HTMLElement): string {
  if (element instanceof HTMLVideoElement) {
    return element.querySelector('source[type]')?.getAttribute('type') || '';
  }
  return '';
}

function downloadDataUrlLocal(url: string, filename: string): void {
  // data: URLs are too large to pass to the background script (exceeds 256KB limit)
  // and do not require Service Worker interception, so they can be downloaded
  // directly in the isolated world using a standard a.click().
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 2000);
}

// Giao thức với tg-main.ts (MAIN world) — phải khớp tên/định dạng ở đó.
const STREAM_REQUEST_EVENT = 'XMD_TG_STREAM_DOWNLOAD';
const STREAM_STATUS_EVENT = 'XMD_TG_STREAM_STATUS';
// tg-main.ts chưa nạp (vừa cập nhật extension mà chưa tải lại tab) thì không bao giờ phản hồi.
const STREAM_START_TIMEOUT_MS = 4_000;

interface StreamStatusDetail {
  id?: unknown;
  state?: unknown;
  received?: unknown;
  total?: unknown;
  message?: unknown;
}

let _streamSeq = 0;

/** Lỗi tải stream — message được hiện trong tooltip nút để người dùng biết lý do. */
class StreamDownloadError extends Error {
  constructor(reason: string) {
    super(`Không tải được video: ${reason}`);
    this.name = 'StreamDownloadError';
  }
}

class StaleExtensionError extends Error {
  constructor() {
    super('Extension vừa được cập nhật — hãy tải lại (F5) tab Telegram rồi thử lại');
    this.name = 'StaleExtensionError';
  }
}

/** Tải video stream bằng Range fetch trong MAIN world; reject nếu thất bại để caller fallback. */
function downloadViaStream(button: HTMLButtonElement, url: string, filename: string): Promise<void> {
  const id = `tg-${Date.now()}-${++_streamSeq}`;
  return new Promise<void>((resolve, reject) => {
    let started = false;
    const finish = (fn: () => void): void => {
      window.clearTimeout(startTimer);
      window.removeEventListener(STREAM_STATUS_EVENT, onStatus);
      fn();
    };
    const onStatus = (event: Event): void => {
      const detail = (event as CustomEvent<StreamStatusDetail>).detail;
      if (!detail || detail.id !== id) return;
      started = true;
      if (detail.state === 'started') {
        button.dataset.state = 'loading';
        button.title = 'Đang tải…';
      } else if (detail.state === 'progress') {
        const received = Number(detail.received);
        const total = Number(detail.total);
        const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0;
        button.dataset.state = 'loading';
        button.title = `Đang tải… ${percent}%`;
      } else if (detail.state === 'done') {
        finish(resolve);
      } else {
        finish(() => reject(new Error(typeof detail.message === 'string' ? detail.message : 'Stream download failed')));
      }
    };
    const startTimer = window.setTimeout(() => {
      if (!started) finish(() => reject(new Error('tg-main chưa sẵn sàng — hãy tải lại tab Telegram')));
    }, STREAM_START_TIMEOUT_MS);

    window.addEventListener(STREAM_STATUS_EVENT, onStatus);
    window.dispatchEvent(new CustomEvent(STREAM_REQUEST_EVENT, { detail: { id, url, filename } }));
  });
}

function setButtonState(button: HTMLButtonElement, state: 'success' | 'error', message?: string): void {
  button.dataset.state = state;
  button.title = message ?? (state === 'success' ? 'Đã bắt đầu tải xuống' : 'Không thể tải xuống');
  // Thông báo tuỳ chỉnh (vd. cần F5 tab) cần thời gian đủ dài để đọc.
  window.setTimeout(() => {
    delete button.dataset.state;
    button.title = 'Tải xuống (X Media Downloader)';
  }, message ? 6_000 : 1500);
}

function findNativeDownloadButton(mediaElement: HTMLElement): HTMLElement | null {
  const viewer = mediaElement.closest('.media-viewer-whole, #MediaViewer');
  let nativeBtn: HTMLElement | null = null;
  if (viewer) {
    nativeBtn = viewer.querySelector<HTMLElement>('button[title="Download"], button[aria-label="Download"], button[title="Download video"], button[title="Tải xuống"], .media-viewer-buttons button.download');
  }
  if (!nativeBtn && mediaElement.parentElement) {
    nativeBtn = mediaElement.parentElement.querySelector<HTMLElement>('button[title="Download"], button.download');
  }
  return nativeBtn;
}

async function handleDownloadClick(
  button: HTMLButtonElement,
  mediaElement: HTMLElement,
  kind: TelegramMediaKind,
  streamUrlOverride?: string,
): Promise<void> {
  if (button.dataset.state === 'loading') return; // đang tải — bỏ qua click đúp

  try {
    // 0. Video stream (Web K /stream/, Web A /progressive/) — nhóm/chat riêng tư bị hạn chế
    // thường chỉ có dạng này. Phải Range-fetch trong trang; a[download] chỉ nhận 1 đoạn 206.
    const streamUrl = streamUrlOverride ?? (kind === 'video' ? mediaUrl(mediaElement) : '');
    if (isTelegramStreamUrl(streamUrl)) {
      try {
        const info = parseTelegramStreamInfo(streamUrl);
        await downloadViaStream(button, streamUrl, telegramMediaFilename('video', streamUrl, mediaMimeType(mediaElement) || info?.mimeType || ''));
        setButtonState(button, 'success');
        return;
      } catch (streamError) {
        console.warn('[ExtensionX] Telegram stream download failed, trying native button:', streamError);
        delete button.dataset.state;
        button.title = 'Tải xuống (X Media Downloader)';
        const native = findNativeDownloadButton(mediaElement);
        if (!native) throw new StreamDownloadError(streamError instanceof Error ? streamError.message : String(streamError));
        native.click();
        setButtonState(button, 'success');
        return;
      }
    }

    // 1. Try to trigger the native Telegram download button first.
    // This is required for videos since they are often streamed via MediaSource (MSE)
    // and cannot be directly downloaded via their blob: URLs.
    const nativeBtn = findNativeDownloadButton(mediaElement);
    if (nativeBtn) {
      nativeBtn.click();
      setButtonState(button, 'success');
      return;
    }

    // 2. Fallback to extracting the media URL
    let url = mediaUrl(mediaElement);
    let mimeType = mediaMimeType(mediaElement);
    if (!url && mediaElement instanceof HTMLCanvasElement) {
      mimeType = 'image/jpeg';
      url = mediaElement.toDataURL(mimeType, 0.95);
    }
    if (!url) throw new Error('Could not determine media URL');

    const filename = telegramMediaFilename(kind, url, mimeType);
    console.log('[ExtensionX] Downloading Telegram media:', url.slice(0, 120));

    if (url.startsWith('data:')) {
      downloadDataUrlLocal(url, filename);
    } else {
      // Sau khi extension được tải lại/cập nhật, script cũ vẫn còn trên tab nhưng chrome.runtime
      // đã bị vô hiệu (undefined) — báo rõ thay vì lỗi "Cannot read properties of undefined".
      if (!chrome.runtime?.id) throw new StaleExtensionError();
      const message: ExtensionMessage = {
        type: 'TG_DOWNLOAD_MEDIA',
        payload: { url, filename, isVideo: kind === 'video' },
      };
      const response = await chrome.runtime.sendMessage(message) as { ok?: boolean; error?: string } | undefined;
      if (!response?.ok) throw new Error(response?.error || 'Download was rejected');
    }
    setButtonState(button, 'success');
  } catch (error) {
    setButtonState(
      button,
      'error',
      error instanceof StaleExtensionError || error instanceof StreamDownloadError ? error.message : undefined,
    );
    console.error('[ExtensionX] Telegram download failed:', error);
  }
}

function attachButtonToMedia(container: HTMLElement, mediaElement: HTMLElement, kind: TelegramMediaKind): void {
  if (container.querySelector('.ext-x-tg-download-btn')) return;
  
  // Set flag to prevent double processing in edge cases, though querySelector is the source of truth
  mediaElement.dataset.extXTelegramDownload = 'true';
  container.classList.add('ext-x-tg-media-wrapper');

  const button = document.createElement('button');
  button.className = 'ext-x-tg-download-btn';
  button.type = 'button';
  button.title = 'Tải xuống (X Media Downloader)';
  button.setAttribute('aria-label', kind === 'video' ? 'Tải video Telegram' : 'Tải ảnh Telegram');
  button.appendChild(createDownloadIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleDownloadClick(button, mediaElement, kind);
  });
  container.appendChild(button);
}

function visibleMediaArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 120) return 0;
  
  // Check if element is completely off-screen (e.g. inactive carousel slides)
  if (rect.right < 0 || rect.left > window.innerWidth) return 0;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return 0;

  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return 0;
  return rect.width * rect.height;
}

// Dấu hiệu 1 khối media là VIDEO (Web K: .video-time/.video-play; Web A: duration/play icon).
// Khi video chưa phát, DOM chỉ có ảnh/canvas thumbnail — không có thẻ <video> để phân biệt.
const VIDEO_HINT_SELECTOR = '.video-time, .video-play, .video-duration, .message-media-duration, .icon-large-play, .media-video, .ckin__player, .VideoPlayer';
const VIDEO_UI_SELECTOR = `video, ${VIDEO_HINT_SELECTOR}`;
const MEDIA_CONTAINER_SELECTOR = '.media-container, .media-inner, .album-item, .album-item-media, .message-media, .Media';

/** Ảnh/canvas này là thumbnail của video (tải nó ra chỉ được 1 tấm ảnh). */
function isVideoThumbnail(element: HTMLElement): boolean {
  const container = element.closest(MEDIA_CONTAINER_SELECTOR) ?? element.parentElement;
  return !!container?.querySelector(VIDEO_HINT_SELECTOR);
}

function isOnScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
}

// URL stream Telegram đã gán cho <video> trong viewer. Khi tải lỗi (vd. 408) Telegram xoá src
// ("Empty src attribute") nên phải nhớ lại URL lúc còn thấy. Chỉ hợp lệ khi đúng phần tử <video>
// đó vẫn còn trong viewer — sang video khác Telegram dựng phần tử mới nên URL cũ tự vô hiệu.
let _rememberedStream: { url: string; element: HTMLVideoElement } | null = null;
let _viewerOpenedAt = 0;
// URL stream mới nhất từng được yêu cầu (PerformanceObserver không bị giới hạn bộ đệm 250 mục).
const _streamRequests: StreamRequestRecord[] = [];

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (isTelegramStreamUrl(entry.name)) _streamRequests.push({ url: entry.name, startTime: entry.startTime });
    }
    if (_streamRequests.length > 50) _streamRequests.splice(0, _streamRequests.length - 50);
  }).observe({ type: 'resource', buffered: true });
} catch {
  // PerformanceObserver không hỗ trợ type 'resource' — bỏ qua, chỉ mất phương án dự phòng.
}

function viewerVideos(viewer: HTMLElement): HTMLVideoElement[] {
  return Array.from(viewer.querySelectorAll<HTMLVideoElement>('video'))
    .filter((video) => !video.closest('.ext-x-tg-download-btn'));
}

function rememberViewerStream(viewer: HTMLElement): void {
  for (const video of viewerVideos(viewer)) {
    const url = mediaUrl(video);
    if (isTelegramStreamUrl(url)) _rememberedStream = { url, element: video };
  }
}

/** Nguồn + phần tử của video đang chiếu trong viewer, kể cả khi <video> đang ẩn/vừa lỗi. */
function findViewerVideoSource(viewer: HTMLElement): { url: string; element: HTMLElement } | null {
  const videos = viewerVideos(viewer);
  const withUrl = videos.filter((video) => mediaUrl(video));
  // Ưu tiên video đang hiển thị; nếu Telegram đang ẩn <video> (opacity 0) lúc tải thì dùng cái còn lại.
  const visible = withUrl.filter(isOnScreen).sort((a, b) => visibleMediaArea(b) - visibleMediaArea(a));
  const chosen = visible[0] ?? withUrl[0];
  if (chosen) return { url: mediaUrl(chosen), element: chosen };

  if (_rememberedStream && viewer.contains(_rememberedStream.element)) return _rememberedStream;

  const requested = pickLatestVideoStreamUrl(_streamRequests, _viewerOpenedAt);
  return requested ? { url: requested, element: viewer } : null;
}

/** Viewer đang hiển thị 1 video (kể cả khi <video> chưa có nguồn/đang tải). */
function viewerShowsVideo(viewer: HTMLElement): boolean {
  return Array.from(viewer.querySelectorAll<HTMLElement>(VIDEO_UI_SELECTOR)).some(isOnScreen);
}

/** Video vừa mở thường cần vài trăm ms mới có nguồn — chờ thay vì rơi về thumbnail. */
async function waitForViewerVideoSource(
  viewer: HTMLElement,
  timeoutMs = 2_500,
): Promise<{ url: string; element: HTMLElement } | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const source = findViewerVideoSource(viewer);
    if (source || Date.now() >= deadline) return source;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
  }
}

function findViewerMedia(viewer: HTMLElement): HTMLElement | null {
  const mediaList = Array.from(viewer.querySelectorAll<HTMLElement>('video, img, canvas'))
    .filter((element) => !element.closest('.ext-x-tg-download-btn'));

  const visibleMedia = mediaList
    .map(element => ({ element, area: visibleMediaArea(element) }))
    .filter(m => m.area > 0)
    .sort((a, b) => {
      // If areas are similar (within 10%), prioritize video over image/canvas
      if (Math.abs(a.area - b.area) < Math.max(a.area, b.area) * 0.1) {
        const isAVideo = a.element instanceof HTMLVideoElement ? 1 : 0;
        const isBVideo = b.element instanceof HTMLVideoElement ? 1 : 0;
        if (isAVideo !== isBVideo) return isBVideo - isAVideo;
      }
      return b.area - a.area;
    });

  if (visibleMedia.length > 0) return visibleMedia[0].element;

  // Web K may render the current photo on a div with background-image.
  const backgrounds = [viewer, ...Array.from(viewer.querySelectorAll<HTMLElement>('div'))]
    .filter((element) => visibleMediaArea(element) > 0 && getComputedStyle(element).backgroundImage !== 'none')
    .sort((left, right) => visibleMediaArea(right) - visibleMediaArea(left));
  return backgrounds[0] || null;
}

async function handleViewerDownload(button: HTMLButtonElement, viewer: HTMLElement): Promise<void> {
  if (button.dataset.state === 'loading') return;

  // Viewer đang chiếu video: chỉ được tải VIDEO. Thumbnail (ảnh/canvas) nằm cùng khung và
  // có thể lớn hơn <video> nên tuyệt đối không dùng làm phương án dự phòng.
  if (viewerShowsVideo(viewer)) {
    const source = await waitForViewerVideoSource(viewer);
    if (!source) {
      setButtonState(button, 'error', 'Video chưa sẵn sàng — chờ video bắt đầu tải rồi thử lại');
      console.error('[ExtensionX] Telegram viewer shows a video but no stream URL is available yet');
      return;
    }
    await handleDownloadClick(button, source.element, 'video', source.url);
    return;
  }

  const media = findViewerMedia(viewer);
  if (!media) {
    setButtonState(button, 'error');
    console.error('[ExtensionX] No visible media found in Telegram viewer');
    return;
  }
  await handleDownloadClick(button, media, media instanceof HTMLVideoElement ? 'video' : 'image');
}

// Nút của Media Viewer được gắn vào <body> chứ KHÔNG gắn vào container viewer của Telegram:
// khi chuyển sang video, Telegram dựng lại/cắt (overflow, transform) nội dung viewer làm nút
// bị xoá hoặc bị clip. Nút body-level không bị ảnh hưởng và chỉ hiện khi viewer đang mở.
let _viewerButton: HTMLButtonElement | null = null;

function activeViewer(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(VIEWER_SELECTOR)).find(isOnScreen) ?? null;
}

function ensureViewerButton(): HTMLButtonElement {
  if (_viewerButton) return _viewerButton;
  const button = document.createElement('button');
  button.className = 'ext-x-tg-download-btn ext-x-tg-viewer-download-btn';
  button.type = 'button';
  button.hidden = true;
  button.title = 'Tải media đang xem (X Media Downloader)';
  button.setAttribute('aria-label', 'Tải media Telegram đang xem');
  button.appendChild(createDownloadIcon());
  // Viewer có thể đóng khi nhận pointer/mouse event bên ngoài vùng nội dung — chặn cả chuỗi sự kiện.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'touchstart']) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const viewer = activeViewer();
    if (!viewer) {
      setButtonState(button, 'error');
      return;
    }
    void handleViewerDownload(button, viewer);
  });
  _viewerButton = button;
  return button;
}

/** Hiện/ẩn nút viewer theo trạng thái viewer, và gắn lại vào <body> nếu bị gỡ. */
function syncViewerButton(): void {
  const viewer = activeViewer();
  const viewerOpen = viewer !== null;
  if (viewer) {
    if (_viewerButton?.hidden !== false) _viewerOpenedAt = performance.now(); // vừa chuyển đóng → mở
    rememberViewerStream(viewer);
  } else {
    _rememberedStream = null;
  }
  if (!viewerOpen && !_viewerButton) return;
  const button = ensureViewerButton();
  if (viewerOpen && !button.isConnected) document.body.appendChild(button);
  button.hidden = !viewerOpen;
}

function processDOM(): void {
  syncViewerButton();

  const videos = document.querySelectorAll<HTMLVideoElement>(
    '.message video, .Message video, .message-media video, .media-viewer video, .MediaViewer video, .VideoPlayer video, video.media-video',
  );
  videos.forEach((video) => {
    if (video.closest(VIEWER_SELECTOR)) return;
    if (video.parentElement) attachButtonToMedia(video.parentElement, video, 'video');
  });

  const images = document.querySelectorAll<HTMLImageElement>(
    'img.media-photo, .message-media img, .media-viewer-aspecter img, .Media img, .Photo img, .MediaViewer img, .album-item-media img',
  );
  images.forEach((image) => {
    if (image.closest(VIEWER_SELECTOR)) return;
    if (image.closest('.avatar, .Avatar, .emoji, .Emoji, .sticker, .Sticker')) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0 && (image.naturalWidth < 120 || image.naturalHeight < 120)) return;
    // Thumbnail của video: nút "tải ảnh" ở đây chỉ tải ra tấm ảnh bìa. Video tải từ nút trong viewer.
    if (isVideoThumbnail(image)) return;
    if (image.parentElement) attachButtonToMedia(image.parentElement, image, 'image');
  });

  document.querySelectorAll<HTMLCanvasElement>('.message-media canvas, .Media canvas').forEach((canvas) => {
    if (canvas.closest(VIEWER_SELECTOR)) return;
    if (isVideoThumbnail(canvas)) return;
    if (canvas.parentElement) attachButtonToMedia(canvas.parentElement, canvas, 'image');
  });
}

function isOwnNode(node: Node): boolean {
  return node instanceof Element && node.classList.contains('ext-x-tg-download-btn');
}

// Gộp nhiều đợt mutation vào 1 lần quét/khung hình, và bỏ qua mutation do chính nút của
// extension gây ra — để không bao giờ tạo vòng lặp "gắn nút → mutation → quét lại".
let _processScheduled = false;
function scheduleProcessDOM(): void {
  if (_processScheduled) return;
  _processScheduled = true;
  window.requestAnimationFrame(() => {
    _processScheduled = false;
    processDOM();
  });
}

const observer = new MutationObserver((mutations) => {
  const hasForeignAddition = mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some((node) => !isOwnNode(node)),
  );
  if (hasForeignAddition) scheduleProcessDOM();
});

observer.observe(document.body, { childList: true, subtree: true });
processDOM();
// Viewer mở/đóng chủ yếu đổi class/style (không thêm node) nên observer childList có thể bỏ sót.
window.setInterval(syncViewerButton, 500);
