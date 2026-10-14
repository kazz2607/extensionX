/**
 * fab-dom.ts — Dựng HTML của Floating Action Button + query DOM refs (Pha 8 refactor).
 * Text nhãn được điền bởi updateFabI18n (fab-i18n.ts), không hard-code ở đây.
 */
import { updateFabI18n } from './fab-i18n.ts';

export interface FabElements {
  fab: HTMLElement;
  panel: HTMLElement;
  mainBtn: HTMLButtonElement;
  badge: HTMLElement;
  countEl: HTMLElement;
  scrollsEl: HTMLElement;
  collectBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  scrollInfo: HTMLElement;
  lblMedia: HTMLElement;
  lblScroll: HTMLElement;
  dragHandle: HTMLElement;
}

export function buildFabDom(root: ParentNode): FabElements {
  const fab = document.createElement('div');
  fab.id = '__xmd_fab__';
  fab.innerHTML = `
    <div id="__xmd_panel__">
      <div class="__xmd_panel_row__">
        <span class="__xmd_label__" id="__xmd_lbl_media__"></span>
        <span class="__xmd_count__" id="__xmd_count__">0</span>
      </div>
      <div class="__xmd_panel_row__">
        <span class="__xmd_label__" id="__xmd_lbl_scroll__"></span>
        <span class="__xmd_count__" id="__xmd_scrolls__" style="font-size:13px;color:#888">0</span>
      </div>
      <div class="__xmd_divider__"></div>
      <div class="__xmd_btn_row__">
        <button class="__xmd_panel_btn__ __xmd_btn_collect__" id="__xmd_collect_btn__">
          <svg class="__xmd_btn_icon__ __xmd_icon_play__" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg class="__xmd_btn_icon__ __xmd_icon_stop__" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 7h10v10H7z"/>
          </svg>
          <span class="__xmd_btn_text__"></span>
        </button>
        <button class="__xmd_panel_btn__ __xmd_btn_download__" id="__xmd_download_btn__" disabled>
          <svg class="__xmd_btn_icon__" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12"/>
            <path d="m7 10 5 5 5-5"/>
            <path d="M5 21h14"/>
          </svg>
          <span class="__xmd_btn_text__"></span>
        </button>
      </div>
      <div class="__xmd_scroll_info__" id="__xmd_scroll_info__"></div>
    </div>
    <div id="__xmd_drag_handle__">
      <svg width="16" height="8" viewBox="0 0 16 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="0.5" width="12" height="1.5" rx="0.75" fill="rgba(255,255,255,0.5)"/>
        <rect x="2" y="3.25" width="12" height="1.5" rx="0.75" fill="rgba(255,255,255,0.5)"/>
        <rect x="2" y="6" width="12" height="1.5" rx="0.75" fill="rgba(255,255,255,0.5)"/>
      </svg>
    </div>
    <button id="__xmd_main_btn__" title="X Media Downloader">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span id="__xmd_badge__">0</span>
    </button>
  `;
  root.appendChild(fab);
  const byId = <T extends HTMLElement>(id: string) => fab.querySelector<T>(`#${id}`)!;

  const elements: FabElements = {
    fab,
    panel: byId('__xmd_panel__'),
    mainBtn: byId<HTMLButtonElement>('__xmd_main_btn__'),
    badge: byId('__xmd_badge__'),
    countEl: byId('__xmd_count__'),
    scrollsEl: byId('__xmd_scrolls__'),
    collectBtn: byId<HTMLButtonElement>('__xmd_collect_btn__'),
    downloadBtn: byId<HTMLButtonElement>('__xmd_download_btn__'),
    scrollInfo: byId('__xmd_scroll_info__'),
    lblMedia: byId('__xmd_lbl_media__'),
    lblScroll: byId('__xmd_lbl_scroll__'),
    dragHandle: byId('__xmd_drag_handle__'),
  };
  updateFabI18n(elements, { isCollecting: false, isDownloading: false });
  return elements;
}
