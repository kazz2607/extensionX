/**
 * shortcuts.ts — Global Keyboard Shortcuts (v5.5.1)
 * Chạy trên MỌI trang web (inject qua manifest content_scripts <all_urls>)
 *
 * Tính năng:
 *   - Hover chuột lên ảnh + Ctrl+C → copy liên kết (href <a>) mà ảnh trỏ tới
 *   - Hover chuột lên ảnh + Ctrl+S → tải ảnh trực tiếp
 *   - Hover chuột lên ảnh + Ctrl+Shift+C → copy URL file ảnh (src)
 *   - Hover chuột lên ảnh + Ctrl+Shift+O → mở ảnh gốc tab mới
 *   - Hover chuột lên ảnh + Ctrl+Shift+G → Google Lens reverse search
 *
 * Script này:
 *   - Nhẹ (~5KB), độc lập, self-contained (không phụ thuộc content.ts hay snackbar.ts)
 *   - Tự tạo toast UI inline
 *   - Đọc config từ chrome.storage.sync, cache trong biến
 *   - Mặc định TẮT — user phải bật trong Settings
 */

(function () {
  'use strict';

  // Guard: chỉ chạy 1 lần
  // @ts-ignore
  if (window.__XMD_SHORTCUTS_LOADED__) return;
  // @ts-ignore
  window.__XMD_SHORTCUTS_LOADED__ = true;

  // ─── Default Config ──────────────────────────────────────────────────────────
  const DEFAULT_SHORTCUTS = {
    enabled: false,    // Mặc định TẮT
    showToast: true,
    copyLink:      { enabled: true, modifiers: 'ctrl', key: 'c' },
    downloadMedia: { enabled: true, modifiers: 'ctrl', key: 's' },
    copyImageUrl:  { enabled: true, modifiers: 'ctrl+shift', key: 'c' },
    openOriginal:  { enabled: true, modifiers: 'ctrl+shift', key: 'o' },
    reverseSearch: { enabled: true, modifiers: 'ctrl+shift', key: 'g' },
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  let config = { ...DEFAULT_SHORTCUTS };
  let mouseX = 0;
  let mouseY = 0;
  let initialized = false;

  // ─── Load Config ──────────────────────────────────────────────────────────────
  function loadConfig() {
    try {
      chrome.storage.sync.get('options', (result: any) => {
        const opts = result?.options || {};
        const sc = opts.shortcuts;
        if (sc) {
          config = {
            enabled:       sc.enabled ?? DEFAULT_SHORTCUTS.enabled,
            showToast:     sc.showToast ?? DEFAULT_SHORTCUTS.showToast,
            copyLink:      sc.copyLink ? { ...DEFAULT_SHORTCUTS.copyLink, ...sc.copyLink } : DEFAULT_SHORTCUTS.copyLink,
            downloadMedia: sc.downloadMedia ? { ...DEFAULT_SHORTCUTS.downloadMedia, ...sc.downloadMedia } : DEFAULT_SHORTCUTS.downloadMedia,
            copyImageUrl:  sc.copyImageUrl ? { ...DEFAULT_SHORTCUTS.copyImageUrl, ...sc.copyImageUrl } : DEFAULT_SHORTCUTS.copyImageUrl,
            openOriginal:  sc.openOriginal ? { ...DEFAULT_SHORTCUTS.openOriginal, ...sc.openOriginal } : DEFAULT_SHORTCUTS.openOriginal,
            reverseSearch: sc.reverseSearch ? { ...DEFAULT_SHORTCUTS.reverseSearch, ...sc.reverseSearch } : DEFAULT_SHORTCUTS.reverseSearch,
          };
        }
        if (config.enabled && !initialized) {
          init();
        }
      });
    } catch (_) {
      // Extension context invalidated — bỏ qua
    }
  }

  loadConfig();

  // Lắng nghe config thay đổi realtime
  try {
    chrome.storage.onChanged.addListener((changes: any, area: string) => {
      if (area === 'sync' && changes.options) {
        loadConfig();
      }
    });
  } catch (_) {}

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;

    // Track tọa độ chuột (để xử lý các trang có overlay che mất ảnh)
    document.addEventListener('mousemove', (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { capture: true, passive: true });

    // Lắng nghe phím tắt — capture phase để chạy trước website handlers
    document.addEventListener('keydown', handleKeydown, true);
  }

  // ─── Keydown Handler ──────────────────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (!config.enabled) return;
    
    // Tìm ảnh dưới con trỏ chuột bằng tọa độ (chống overlay)
    const elements = document.elementsFromPoint(mouseX, mouseY);
    const hoveredImg = elements.find(el => el.tagName === 'IMG') as HTMLImageElement | undefined;
    
    if (!hoveredImg) return;

    // Skip nếu đang focus input/textarea/contenteditable
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((active as HTMLElement).isContentEditable) return;
    }

    // Skip nếu có text đang được selected
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    // Match từng shortcut
    if (matchShortcut(e, config.copyLink)) {
      e.preventDefault();
      e.stopPropagation();
      actionCopyLink(hoveredImg);
      return;
    }

    if (matchShortcut(e, config.downloadMedia)) {
      e.preventDefault();
      e.stopPropagation();
      actionDownloadMedia(hoveredImg);
      return;
    }

    if (matchShortcut(e, config.copyImageUrl)) {
      e.preventDefault();
      e.stopPropagation();
      actionCopyImageUrl(hoveredImg);
      return;
    }

    if (matchShortcut(e, config.openOriginal)) {
      e.preventDefault();
      e.stopPropagation();
      actionOpenOriginal(hoveredImg);
      return;
    }

    if (matchShortcut(e, config.reverseSearch)) {
      e.preventDefault();
      e.stopPropagation();
      actionReverseSearch(hoveredImg);
      return;
    }
  }

  // ─── Shortcut Matcher ─────────────────────────────────────────────────────────
  function matchShortcut(
    e: KeyboardEvent,
    action: { enabled: boolean; modifiers: string; key: string }
  ): boolean {
    if (!action.enabled) return false;
    if (e.key.toLowerCase() !== action.key.toLowerCase()) return false;

    const mods = action.modifiers.toLowerCase();
    const needCtrl  = mods.includes('ctrl');
    const needShift = mods.includes('shift');
    const needAlt   = mods.includes('alt');

    if (needCtrl  !== (e.ctrlKey || e.metaKey)) return false;
    if (needShift !== e.shiftKey) return false;
    if (needAlt   !== e.altKey) return false;

    return true;
  }

  // ─── S1: Copy Liên Kết Ảnh ────────────────────────────────────────────────────
  function actionCopyLink(img: HTMLImageElement) {
    let url: string | null = null;

    // Trường hợp đặc biệt: X.com / Twitter
    if (isXcom()) {
      url = extractTweetLink(img);
    }

    // Generic: tìm <a> cha gần nhất
    if (!url) {
      url = getParentLinkHref(img);
    }

    // Fallback: copy src ảnh
    if (!url) {
      url = getBestImageSrc(img);
    }

    if (url) {
      copyToClipboard(url);
      showToast('✓ Copied link: ' + truncateUrl(url, 55));
    }
  }

  // ─── S2: Tải Ảnh Đang Hover ──────────────────────────────────────────────────
  function actionDownloadMedia(img: HTMLImageElement) {
    const url = getBestImageSrc(img);
    if (!url) return;

    try {
      chrome.runtime.sendMessage({
        type: 'SHORTCUT_DOWNLOAD',
        payload: { url, pageUrl: location.href }
      });
      showToast('⬇ Downloading...');
    } catch (_) {
      // Fallback: mở ảnh trong tab mới để user tự save
      window.open(url, '_blank');
      showToast('⬇ Opened in new tab');
    }
  }

  // ─── S3: Copy URL File Ảnh ────────────────────────────────────────────────────
  function actionCopyImageUrl(img: HTMLImageElement) {
    const url = getBestImageSrc(img);
    if (url) {
      copyToClipboard(url);
      showToast('✓ Copied image URL: ' + truncateUrl(url, 50));
    }
  }

  // ─── S4: Mở Ảnh Gốc Tab Mới ──────────────────────────────────────────────────
  function actionOpenOriginal(img: HTMLImageElement) {
    const url = getBestImageSrc(img);
    if (url) {
      window.open(url, '_blank');
      showToast('🌐 Opened original image');
    }
  }

  // ─── S5: Reverse Image Search ─────────────────────────────────────────────────
  function actionReverseSearch(img: HTMLImageElement) {
    const url = getBestImageSrc(img);
    if (url) {
      const lensUrl = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(url);
      window.open(lensUrl, '_blank');
      showToast('🔍 Opening Google Lens...');
    }
  }

  // ─── Helpers: Extract URLs ────────────────────────────────────────────────────

  /** Tìm href của <a> cha gần nhất */
  function getParentLinkHref(el: HTMLElement): string | null {
    const a = el.closest('a[href]') as HTMLAnchorElement | null;
    if (!a) return null;

    const href = a.href;
    // Bỏ qua href không hợp lệ
    if (!href || href === '#' || href.startsWith('javascript:')) return null;
    return href;
  }

  /** Lấy URL ảnh tốt nhất: ưu tiên data-src, srcset, rồi src */
  function getBestImageSrc(img: HTMLImageElement): string | null {
    // X.com: thay ?name=small → ?name=orig
    let src = img.src || '';
    if (src.includes('pbs.twimg.com')) {
      src = src.replace(/[?&]name=\w+/, '?name=orig');
      if (!src.includes('?name=orig') && !src.includes('&name=orig')) {
        src += (src.includes('?') ? '&' : '?') + 'name=orig';
      }
      return src;
    }

    // Ưu tiên data-src (lazy load)
    const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original');
    if (dataSrc && dataSrc.startsWith('http')) return dataSrc;

    // srcset: lấy URL lớn nhất
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const largest = parseSrcsetLargest(srcset);
      if (largest) return largest;
    }

    return src || null;
  }

  /** Parse srcset và trả về URL lớn nhất */
  function parseSrcsetLargest(srcset: string): string | null {
    const entries = srcset.split(',').map(s => s.trim()).filter(Boolean);
    let bestUrl = '';
    let bestSize = 0;

    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '';
      const size = parseInt(descriptor) || 0;
      if (size > bestSize) {
        bestSize = size;
        bestUrl = url;
      }
    }

    return bestUrl || null;
  }

  /** X.com: trích xuất tweet permalink từ ảnh */
  function extractTweetLink(img: HTMLImageElement): string | null {
    const article = img.closest('article');
    if (!article) return null;

    // Tìm link /status/ trong article
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    let tweetPath = '';
    for (const link of statusLinks) {
      const m = (link as HTMLAnchorElement).href.match(
        /https?:\/\/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/
      );
      if (m) {
        tweetPath = `/${m[1]}/status/${m[2]}`;
        break;
      }
    }
    if (!tweetPath) return null;

    // Xác định ảnh là ảnh thứ mấy trong tweet
    const mediaImgs = Array.from(
      article.querySelectorAll('img[src*="pbs.twimg.com/media"]')
    );
    const idx = mediaImgs.indexOf(img);
    const photoSuffix = idx >= 0 ? `/photo/${idx + 1}` : '';

    return `https://x.com${tweetPath}${photoSuffix}`;
  }

  function isXcom(): boolean {
    const host = location.hostname;
    return host === 'x.com' || host === 'twitter.com'
      || host.endsWith('.x.com') || host.endsWith('.twitter.com');
  }

  // ─── Clipboard ────────────────────────────────────────────────────────────────
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback cho trường hợp Permissions API không cho phép
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  // ─── Toast Notification ───────────────────────────────────────────────────────
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string) {
    if (!config.showToast) return;

    let toast = document.getElementById('__xmd_shortcut_toast__');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = '__xmd_shortcut_toast__';
      toast.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(60px) !important;
        background: rgba(15, 15, 15, 0.92) !important;
        color: #00ba7c !important;
        padding: 10px 20px !important;
        border-radius: 999px !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        line-height: 1.2 !important;
        border: 1px solid rgba(0, 186, 124, 0.3) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
        z-index: 2147483647 !important;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.3s ease !important;
        opacity: 0 !important;
        pointer-events: none !important;
        max-width: 500px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      `;
      document.body.appendChild(toast);
    }

    // Clear previous timeout
    if (toastTimeout) clearTimeout(toastTimeout);

    // Show
    toast.textContent = message;
    requestAnimationFrame(() => {
      toast!.style.opacity = '1';
      toast!.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Auto-hide sau 2.5s
    toastTimeout = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(60px)';
      }
    }, 2500);
  }

  // ─── Utility ──────────────────────────────────────────────────────────────────
  function truncateUrl(url: string, max: number): string {
    if (url.length <= max) return url;
    return url.substring(0, max - 3) + '...';
  }

})();
