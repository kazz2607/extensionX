import type { ExtensionMessage } from '../shared/messages';
import { telegramMediaFilename, type TelegramMediaKind } from '../shared/telegram-media.ts';

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

function downloadInPage(url: string, filename: string): void {
  // Để tải được các blob: URLs do Service Worker của Telegram tạo ra (trong các nhóm private/bình thường),
  // ta BẮT BUỘC phải thực thi lệnh click tải xuống ở MAIN world (ngữ cảnh của trang web).
  // Nếu gọi a.click() từ ISOLATED world (content script), Chrome sẽ bỏ qua Service Worker và báo lỗi Network Error.
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      try {
        var a = document.createElement('a');
        a.href = ${JSON.stringify(url)};
        a.download = ${JSON.stringify(filename)};
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { a.remove(); }, 2000);
      } catch (e) {
        console.error('[ExtensionX] Lỗi khi kích hoạt tải xuống:', e);
      }
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();
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
    // 1. Try to trigger the native Telegram download button first.
    // This is required for videos since they are often streamed via MediaSource (MSE)
    // and cannot be directly downloaded via their blob: URLs.
    const viewer = mediaElement.closest('.media-viewer-whole, #MediaViewer');
    let nativeBtn: HTMLElement | null = null;
    if (viewer) {
      nativeBtn = viewer.querySelector<HTMLElement>('button[title="Download"], button[aria-label="Download"], button[title="Download video"], button[title="Tải xuống"], .media-viewer-buttons button.download');
    }
    if (!nativeBtn && mediaElement.parentElement) {
      nativeBtn = mediaElement.parentElement.querySelector<HTMLElement>('button[title="Download"], button.download');
    }

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
  button.addEventListener('click', (event) => void handleDownloadClick(event, mediaElement, kind));
  container.appendChild(button);
}

function visibleMediaArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 120) return 0;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return 0;
  return rect.width * rect.height;
}

function findViewerMedia(viewer: HTMLElement): HTMLElement | null {
  const media = Array.from(viewer.querySelectorAll<HTMLElement>('video, img, canvas'))
    .filter((element) => !element.closest('.ext-x-tg-download-btn'))
    .sort((left, right) => visibleMediaArea(right) - visibleMediaArea(left));
  if (media.length > 0 && visibleMediaArea(media[0]) > 0) return media[0];

  // Web K may render the current photo on a div with background-image.
  const backgrounds = [viewer, ...Array.from(viewer.querySelectorAll<HTMLElement>('div'))]
    .filter((element) => visibleMediaArea(element) > 0 && getComputedStyle(element).backgroundImage !== 'none')
    .sort((left, right) => visibleMediaArea(right) - visibleMediaArea(left));
  return backgrounds[0] || null;
}

function attachButtonToViewer(viewer: HTMLElement): void {
  // React may re-render the viewer contents and destroy our button while keeping the wrapper.
  // We MUST check if the button actually exists in the DOM instead of relying solely on dataset.
  if (viewer.querySelector('.ext-x-tg-viewer-download-btn')) return;
  viewer.dataset.extXTelegramViewerDownload = 'true';

  const button = document.createElement('button');
  button.className = 'ext-x-tg-download-btn ext-x-tg-viewer-download-btn';
  button.type = 'button';
  button.title = 'Tải media đang xem (X Media Downloader)';
  button.setAttribute('aria-label', 'Tải media Telegram đang xem');
  button.appendChild(createDownloadIcon());
  button.addEventListener('click', (event) => {
    const media = findViewerMedia(viewer);
    if (!media) {
      setButtonState(button, 'error');
      console.error('[ExtensionX] No visible media found in Telegram viewer');
      return;
    }
    void handleDownloadClick(event, media, media instanceof HTMLVideoElement ? 'video' : 'image');
  });
  viewer.appendChild(button);
}

function processDOM(): void {
  document.querySelectorAll<HTMLElement>(VIEWER_SELECTOR).forEach(attachButtonToViewer);

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
    if (image.parentElement) attachButtonToMedia(image.parentElement, image, 'image');
  });

  document.querySelectorAll<HTMLCanvasElement>('.message-media canvas, .Media canvas').forEach((canvas) => {
    if (canvas.closest(VIEWER_SELECTOR)) return;
    if (canvas.parentElement) attachButtonToMedia(canvas.parentElement, canvas, 'image');
  });
}

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.addedNodes.length > 0)) processDOM();
});

observer.observe(document.body, { childList: true, subtree: true });
processDOM();
