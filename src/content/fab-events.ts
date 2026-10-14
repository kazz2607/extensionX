/**
 * fab-events.ts — Event bridge của FAB: click handlers + XMD_FAB_UPDATE/XMD_LANG_UPDATE
 * (Pha 8 refactor). Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */
import type { FabElements } from './fab-dom.ts';
import { setPanelButtonText, updateFabI18n } from './fab-i18n.ts';
import { emitUi, onUi } from './ui-bus.ts';

export function initFabEvents(elements: FabElements): { closePanel: () => void } {
  const { fab, panel, mainBtn, badge, countEl, scrollsEl, collectBtn, downloadBtn, scrollInfo } = elements;

  // ─── State ───────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let isCollecting = false;
  let isDownloading = false; // FIX: flag riêng cho download, độc lập với downloadBtn.disabled
  let mediaCount = 0;

  function closePanel(): void {
    panelOpen = false;
    panel.classList.remove('visible');
  }

  onUi('XMD_LANG_UPDATE', (detail) => {
    const lang = (detail as { lang?: unknown } | null)?.lang;
    if (window.i18n && typeof lang === 'string') {
      window.i18n.lang = lang;
      updateFabI18n(elements, { isCollecting, isDownloading });
    }
  });

  // ─── Toggle Panel ────────────────────────────────────────────────────────────
  mainBtn.addEventListener('click', () => {
    // Nếu đang download: bấm vào main btn = toggle panel (xem tiến độ)
    if (isDownloading) {
      panelOpen = !panelOpen;
      panel.classList.toggle('visible', panelOpen);
      return;
    }
    // Nếu có media và chưa đang download: bấm main btn = download luôn
    if (mediaCount > 0) {
      isDownloading = true;
      emitUi('XMD_FAB_ACTION', { action: 'START_DOWNLOAD' });
      setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_downloading') : '⏳ Đang tải...');
      downloadBtn.disabled = true;
      // Đóng panel nếu đang mở
      closePanel();
      return;
    }
    // Chưa có media: toggle panel để dùng nút Thu Thập
    panelOpen = !panelOpen;
    panel.classList.toggle('visible', panelOpen);
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
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_stop') : '⏹ Dừng');
      collectBtn.classList.add('active');
      mainBtn.classList.add('collecting');
      scrollInfo.classList.add('visible');
      // Gửi lệnh START_COLLECTING qua custom event → content.js relay
      emitUi('XMD_FAB_ACTION', { action: 'START_COLLECTING' });
    } else {
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
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
    setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_downloading') : '⏳ Đang tải...');
    downloadBtn.disabled = true;
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
    }

    if (scrollCount !== undefined) {
      scrollsEl.textContent = String(scrollCount);
    }

    if (state === 'COLLECT_DONE') {
      isCollecting = false;
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
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
      setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_download') : '↓ Download');
      downloadBtn.disabled = mediaCount === 0;
    }
  });

  return { closePanel };
}
