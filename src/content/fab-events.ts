/**
 * fab-events.ts — Event bridge của FAB: click handlers + XMD_FAB_UPDATE/XMD_LANG_UPDATE
 * (Pha 8 refactor). Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */
import type { FabElements } from './fab-dom.ts';
import { setPanelButtonText, updateFabI18n } from './fab-i18n.ts';
import { emitUi, onUi } from './ui-bus.ts';
import { t } from './x-ui-i18n.ts';

export function initFabEvents(elements: FabElements): { closePanel: () => void } {
  const { fab, panel, mainBtn, badge, countEl, scrollsEl, collectBtn, downloadBtn, scrollInfo } = elements;

  // ─── State ───────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let isCollecting = false;
  let isDownloading = false; // FIX: flag riêng cho download, độc lập với downloadBtn.disabled
  let mediaCount = 0;

  function setPanelOpen(open: boolean): void {
    panelOpen = open;
    panel.classList.toggle('visible', open);
    mainBtn.setAttribute('aria-expanded', String(open));
  }

  function closePanel(): void {
    setPanelOpen(false);
  }

  // U20: nút chính chỉ có badge số bên trong nên screen reader đọc "0, button".
  // Tên truy cập nói rõ bấm sẽ làm gì (tải ngay hay mở bảng).
  function updateMainLabel(): void {
    mainBtn.setAttribute('aria-label', mediaCount > 0 && !isDownloading
      ? t('fab_main_download', { count: mediaCount })
      : t('fab_main_open'));
  }
  mainBtn.setAttribute('aria-controls', panel.id);
  mainBtn.setAttribute('aria-expanded', 'false');
  updateMainLabel();

  // Escape đóng bảng; chỉ trả focus về nút chính khi focus đang ở trong FAB
  // (không kéo focus khỏi ô soạn tweet của X).
  document.addEventListener('keydown', (e) => {
    if (!panelOpen || e.key !== 'Escape') return;
    const focusInside = Boolean((fab.getRootNode() as ShadowRoot | Document).activeElement && fab.contains((fab.getRootNode() as ShadowRoot | Document).activeElement));
    closePanel();
    if (focusInside) mainBtn.focus();
  }, true);

  onUi('XMD_LANG_UPDATE', (detail) => {
    const lang = (detail as { lang?: unknown } | null)?.lang;
    if (window.i18n && typeof lang === 'string') {
      window.i18n.lang = lang;
      updateFabI18n(elements, { isCollecting, isDownloading });
      updateMainLabel();
    }
  });

  // ─── Toggle Panel ────────────────────────────────────────────────────────────
  mainBtn.addEventListener('click', () => {
    // Nếu đang download: bấm vào main btn = toggle panel (xem tiến độ)
    if (isDownloading) {
      setPanelOpen(!panelOpen);
      return;
    }
    // Nếu có media và chưa đang download: bấm main btn = download luôn
    if (mediaCount > 0) {
      isDownloading = true;
      emitUi('XMD_FAB_ACTION', { action: 'START_DOWNLOAD' });
      setPanelButtonText(downloadBtn, t('fab_downloading'));
      downloadBtn.disabled = true;
      updateMainLabel();
      // Đóng panel nếu đang mở
      closePanel();
      return;
    }
    // Chưa có media: toggle panel để dùng nút Thu Thập
    setPanelOpen(!panelOpen);
  });

  // Đóng panel khi click ra ngoài. From the document, clicks inside the closed
  // shadow root are retargeted to its host element.
  const host = (fab.getRootNode() as ShadowRoot).host ?? fab;
  document.addEventListener('click', (e) => {
    if (e.target !== host && !fab.contains(e.target as Node)) {
      closePanel();
    }
  }, true);

  // ─── Collect Button ──────────────────────────────────────────────────────────
  collectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollecting = !isCollecting;

    if (isCollecting) {
      setPanelButtonText(collectBtn, t('fab_collect_stop'));
      collectBtn.classList.add('active');
      mainBtn.classList.add('collecting');
      scrollInfo.classList.add('visible');
      // Gửi lệnh START_COLLECTING qua custom event → content.js relay
      emitUi('XMD_FAB_ACTION', { action: 'START_COLLECTING' });
    } else {
      setPanelButtonText(collectBtn, t('fab_collect_start'));
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
      emitUi('XMD_FAB_ACTION', { action: 'STOP_COLLECTING' });
    }
  });

  // ─── Download Button ─────────────────────────────────────────────────────────
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (downloadBtn.disabled || isDownloading) return;
    isDownloading = true;
    emitUi('XMD_FAB_ACTION', { action: 'START_DOWNLOAD' });
    setPanelButtonText(downloadBtn, t('fab_downloading'));
    downloadBtn.disabled = true;
    updateMainLabel();
  });

  // ─── Update từ messages ──────────────────────────────────────────────────────
  onUi('XMD_FAB_UPDATE', (detail) => {
    const update = (detail || {}) as { count?: number; scrollCount?: number; state?: string; percent?: number; current?: number; total?: number };
    const { count, scrollCount, state } = update;

    if (count !== undefined) {
      mediaCount = count;
      countEl.textContent = String(count);
      badge.textContent = count > 999 ? '999+' : String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
      downloadBtn.disabled = count === 0;
      updateMainLabel();
    }

    if (scrollCount !== undefined) {
      scrollsEl.textContent = String(scrollCount);
    }

    if (state === 'COLLECT_DONE') {
      isCollecting = false;
      setPanelButtonText(collectBtn, t('fab_collect_start'));
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
    }

    // UI-05: FAB mini progress — hiện % khi đang download
    if (state === 'DOWNLOAD_PROGRESS' && update.percent !== undefined) {
      setPanelButtonText(downloadBtn, `⏳ ${update.percent}% (${update.current}/${update.total})`);
    }

    if (state === 'DOWNLOAD_DONE') {
      isDownloading = false; // FIX: reset flag để cho phép download lần tiếp
      setPanelButtonText(downloadBtn, t('fab_download'));
      downloadBtn.disabled = mediaCount === 0;
      updateMainLabel();
    }
  });

  return { closePanel };
}
