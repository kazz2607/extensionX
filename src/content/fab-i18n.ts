/**
 * fab-i18n.ts — Cập nhật text i18n cho FAB (Pha 8 refactor).
 * Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */
import type { FabElements } from './fab-dom.ts';

export interface FabState {
  isCollecting: boolean;
  isDownloading: boolean;
}

export function panelButtonLabel(rawLabel: string): string {
  return String(rawLabel || '').replace(/^(?:[▶⏹↓⏳⟳]\s*)+/u, '').trim();
}

export function setPanelButtonText(button: HTMLElement, label: string): void {
  const textEl = button.querySelector('.__xmd_btn_text__');
  if (textEl) textEl.textContent = panelButtonLabel(label);
}

export function updateFabI18n(elements: FabElements, state: FabState): void {
  if (!window.i18n) return;
  const { lblMedia, lblScroll, collectBtn, downloadBtn, scrollInfo } = elements;
  lblMedia.textContent = window.i18n.t('fab_media_collected');
  lblScroll.textContent = window.i18n.t('fab_scroll');
  setPanelButtonText(collectBtn, state.isCollecting ? window.i18n.t('fab_collect_stop') : window.i18n.t('fab_collect_start'));
  // BUG-F FIX: Dùng isDownloading flag thay vì check text content (ngược logic cũ)
  // text.includes('...') không tin cậy — nếu đang download thì không overwrite bằng text idle
  setPanelButtonText(downloadBtn, state.isDownloading
    ? window.i18n.t('fab_downloading')
    : window.i18n.t('fab_download'));
  scrollInfo.textContent = window.i18n.t('fab_scrolling');
}
