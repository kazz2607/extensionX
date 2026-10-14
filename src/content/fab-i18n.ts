/**
 * fab-i18n.ts — Cập nhật text i18n cho FAB (Pha 8 refactor).
 */
import { t } from './x-ui-i18n.ts';
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
  const { lblMedia, lblScroll, collectBtn, downloadBtn, scrollInfo, dragHandle } = elements;
  lblMedia.textContent = t('fab_media_collected');
  lblScroll.textContent = t('fab_scroll');
  setPanelButtonText(collectBtn, state.isCollecting ? t('fab_collect_stop') : t('fab_collect_start'));
  // BUG-F FIX: Dùng isDownloading flag thay vì check text content (ngược logic cũ)
  // text.includes('...') không tin cậy — nếu đang download thì không overwrite bằng text idle
  setPanelButtonText(downloadBtn, state.isDownloading ? t('fab_downloading') : t('fab_download'));
  scrollInfo.textContent = t('fab_scrolling');
  dragHandle.title = t('fab_drag_handle');
}
