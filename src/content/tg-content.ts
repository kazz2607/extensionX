import type { ExtensionMessage } from '../shared/messages';
import { telegramMediaFilename, type TelegramMediaKind } from '../shared/telegram-media.ts';

console.log('[ExtensionX] Telegram Web Content Script loaded.');

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
  return '';
}

function mediaMimeType(element: HTMLElement): string {
  if (element instanceof HTMLVideoElement) {
    return element.querySelector('source[type]')?.getAttribute('type') || '';
  }
  return '';
}

function downloadInPage(url: string, filename: string): void {
  // blob: URLs belong to this Telegram document and data: URLs can be much
  // larger than Chrome's runtime-message limit, so keep both in this context.
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.documentElement.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function setButtonState(button: HTMLButtonElement, state: 'success' | 'error'): void {
  button.dataset.state = state;
  button.title = state === 'success' ? 'Đã bắt đầu tải xuống' : 'Không thể tải xuống';
  window.setTimeout(() => {
    delete button.dataset.state;
    button.title = 'Tải xuống (X Media Downloader)';
  }, 1500);
}

async function handleDownloadClick(event: MouseEvent, mediaElement: HTMLElement, kind: TelegramMediaKind): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget as HTMLButtonElement;

  try {
    let url = mediaUrl(mediaElement);
    let mimeType = mediaMimeType(mediaElement);
    if (!url && mediaElement instanceof HTMLCanvasElement) {
      mimeType = 'image/jpeg';
      url = mediaElement.toDataURL(mimeType, 0.95);
    }
    if (!url) throw new Error('Could not determine media URL');

    const filename = telegramMediaFilename(kind, url, mimeType);
    console.log('[ExtensionX] Downloading Telegram media:', url.slice(0, 120));

    if (url.startsWith('blob:') || url.startsWith('data:')) {
      downloadInPage(url, filename);
    } else {
      const message: ExtensionMessage = {
        type: 'TG_DOWNLOAD_MEDIA',
        payload: { url, filename, isVideo: kind === 'video' },
      };
      const response = await chrome.runtime.sendMessage(message) as { ok?: boolean; error?: string } | undefined;
      if (!response?.ok) throw new Error(response?.error || 'Download was rejected');
    }
    setButtonState(button, 'success');
  } catch (error) {
    setButtonState(button, 'error');
    console.error('[ExtensionX] Telegram download failed:', error);
  }
}

function attachButtonToMedia(container: HTMLElement, mediaElement: HTMLElement, kind: TelegramMediaKind): void {
  if (mediaElement.dataset.extXTelegramDownload === 'true') return;
  mediaElement.dataset.extXTelegramDownload = 'true';
  container.classList.add('ext-x-tg-media-wrapper');

  const button = document.createElement('button');
  button.className = 'ext-x-tg-download-btn';
  button.type = 'button';
  button.title = 'Tải xuống (X Media Downloader)';
  button.setAttribute('aria-label', kind === 'video' ? 'Tải video Telegram' : 'Tải ảnh Telegram');
  button.appendChild(createDownloadIcon());
  button.addEventListener('click', (event) => void handleDownloadClick(event, mediaElement, kind));
  container.appendChild(button);
}

function processDOM(): void {
  const videos = document.querySelectorAll<HTMLVideoElement>(
    '.message video, .Message video, .message-media video, .media-viewer video, .MediaViewer video, .VideoPlayer video, video.media-video',
  );
  videos.forEach((video) => {
    if (video.parentElement) attachButtonToMedia(video.parentElement, video, 'video');
  });

  const images = document.querySelectorAll<HTMLImageElement>(
    'img.media-photo, .message-media img, .media-viewer-aspecter img, .Media img, .Photo img, .MediaViewer img, .album-item-media img',
  );
  images.forEach((image) => {
    if (image.closest('.avatar, .Avatar, .emoji, .Emoji, .sticker, .Sticker')) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0 && (image.naturalWidth < 120 || image.naturalHeight < 120)) return;
    if (image.parentElement) attachButtonToMedia(image.parentElement, image, 'image');
  });

  document.querySelectorAll<HTMLCanvasElement>('.message-media canvas, .Media canvas').forEach((canvas) => {
    if (canvas.parentElement) attachButtonToMedia(canvas.parentElement, canvas, 'image');
  });
}

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.addedNodes.length > 0)) processDOM();
});

observer.observe(document.body, { childList: true, subtree: true });
processDOM();
