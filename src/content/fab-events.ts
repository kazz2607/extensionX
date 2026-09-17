/**
 * fab-events.ts — Event bridge của FAB: click handlers + XMD_FAB_UPDATE/XMD_LANG_UPDATE
 * (Pha 8 refactor). Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */
import type { FabElements } from './fab-dom.ts';
import { setPanelButtonText, updateFabI18n } from './fab-i18n.ts';

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

  window.addEventListener('XMD_LANG_UPDATE', (e) => {
    if (window.i18n && (e as CustomEvent).detail?.lang) {
      window.i18n.lang = (e as CustomEvent).detail.lang;
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
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'START_DOWNLOAD' },
      }));
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

  // Đóng panel khi click ra ngoài
  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target as Node)) {
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
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'START_COLLECTING' },
      }));
    } else {
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'STOP_COLLECTING' },
      }));
    }
  });

  // ─── Download Button ─────────────────────────────────────────────────────────
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (downloadBtn.disabled || isDownloading) return;
    isDownloading = true;
    window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
      detail: { action: 'START_DOWNLOAD' },
    }));
    setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_downloading') : '⏳ Đang tải...');
    downloadBtn.disabled = true;
  });

  // ─── Update từ messages ──────────────────────────────────────────────────────
  window.addEventListener('XMD_FAB_UPDATE', (e) => {
    const { count, scrollCount, state } = (e as CustomEvent).detail || {};

    if (count !== undefined) {
      mediaCount = count;
      countEl.textContent = count;
      badge.textContent = count > 999 ? '999+' : String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
      downloadBtn.disabled = count === 0;
    }

    if (scrollCount !== undefined) {
      scrollsEl.textContent = scrollCount;
    }

    if (state === 'COLLECT_DONE') {
      isCollecting = false;
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
    }

    // UI-05: FAB mini progress — hiện % khi đang download
    if (state === 'DOWNLOAD_PROGRESS' && (e as CustomEvent).detail.percent !== undefined) {
      const pct = (e as CustomEvent).detail.percent;
      setPanelButtonText(downloadBtn, `⏳ ${pct}% (${(e as CustomEvent).detail.current}/${(e as CustomEvent).detail.total})`);
    }

    if (state === 'DOWNLOAD_DONE') {
      isDownloading = false; // FIX: reset flag để cho phép download lần tiếp
      setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_download') : '↓ Download');
      downloadBtn.disabled = mediaCount === 0;
    }
  });

  return { closePanel };
}
