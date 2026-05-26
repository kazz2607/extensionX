/**
 * fab.js — Floating Action Button trên trang X.com
 * Hiển thị mini widget góc phải màn hình với:
 *   - Badge số lượng media đã thu thập
 *   - Nút Quick Collect / Stop
 *   - Nút Quick Download
 *
 * Chạy trong EXTENSION ISOLATED WORLD (content script)
 */

(function () {
  'use strict';

  // Tránh khởi tạo nhiều lần
  if (document.getElementById('__xmd_fab__')) return;

  // ─── Inject CSS ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__xmd_fab_style__';
  style.textContent = `
    #__xmd_fab__ {
      position: fixed;
      bottom: 20%;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      font-family: -apple-system, 'Inter', BlinkMacSystemFont, sans-serif;
      pointer-events: none;
    }

    #__xmd_fab__ * { box-sizing: border-box; }

    /* Info panel */
    #__xmd_panel__ {
      background: rgba(15, 15, 15, 0.96);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      padding: 10px 14px;
      backdrop-filter: blur(20px);
      min-width: 180px;
      pointer-events: all;
      transform: translateX(220px);
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
      opacity: 0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(29,155,240,0.2);
    }

    #__xmd_panel__.visible {
      transform: translateX(0);
      opacity: 1;
    }

    .__xmd_panel_row__ {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .__xmd_panel_row__:last-child { margin-bottom: 0; }

    .__xmd_label__ {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      font-weight: 400;
    }

    .__xmd_count__ {
      font-size: 16px;
      font-weight: 700;
      color: #1D9BF0;
      font-variant-numeric: tabular-nums;
    }

    .__xmd_divider__ {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 8px 0;
    }

    .__xmd_btn_row__ {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .__xmd_panel_btn__ {
      padding: 7px 10px;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .__xmd_panel_btn__:hover { transform: scale(1.04); }

    .__xmd_btn_collect__ {
      background: rgba(29,155,240,0.2);
      color: #1D9BF0;
      border: 1px solid rgba(29,155,240,0.3);
    }

    .__xmd_btn_collect__.active {
      background: rgba(244,33,46,0.2);
      color: #f4212e;
      border-color: rgba(244,33,46,0.3);
    }

    .__xmd_btn_download__ {
      background: rgba(0,186,124,0.15);
      color: #00ba7c;
      border: 1px solid rgba(0,186,124,0.3);
    }

    .__xmd_btn_download__:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Main FAB button */
    #__xmd_main_btn__ {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1D9BF0, #a855f7);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(29,155,240,0.5), 0 0 0 0 rgba(29,155,240,0.4);
      transition: all 0.2s;
      position: relative;
      pointer-events: all;
      animation: __xmd_pulse__ 3s infinite;
      color: white;
    }

    @keyframes __xmd_pulse__ {
      0%   { box-shadow: 0 4px 20px rgba(29,155,240,0.5), 0 0 0 0 rgba(29,155,240,0.4); }
      70%  { box-shadow: 0 4px 20px rgba(29,155,240,0.5), 0 0 0 10px rgba(29,155,240,0); }
      100% { box-shadow: 0 4px 20px rgba(29,155,240,0.5), 0 0 0 0 rgba(29,155,240,0); }
    }

    #__xmd_main_btn__:hover { transform: scale(1.1); }
    #__xmd_main_btn__:active { transform: scale(0.95); }

    /* Badge */
    #__xmd_badge__ {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #f4212e;
      color: white;
      font-size: 9px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid rgba(15,15,15,0.9);
      display: none;
    }

    /* Collecting spinner on FAB */
    #__xmd_main_btn__.collecting {
      animation: __xmd_spin_pulse__ 2s linear infinite;
    }

    @keyframes __xmd_spin_pulse__ {
      0%   { box-shadow: 0 0 0 0 rgba(244,33,46,0.5); }
      50%  { box-shadow: 0 0 0 12px rgba(244,33,46,0); }
      100% { box-shadow: 0 0 0 0 rgba(244,33,46,0); }
    }

    /* Scrolling stats mini */
    .__xmd_scroll_info__ {
      font-size: 10px;
      color: #00ba7c;
      text-align: center;
      padding-top: 6px;
      display: none;
    }

    .__xmd_scroll_info__.visible { display: block; }
  `;
  document.documentElement.appendChild(style);

  // ─── Build FAB HTML ──────────────────────────────────────────────────────────
  const fab = document.createElement('div');
  fab.id = '__xmd_fab__';
  fab.innerHTML = `
    <div id="__xmd_panel__">
      <div class="__xmd_panel_row__">
        <span class="__xmd_label__">Media thu thập</span>
        <span class="__xmd_count__" id="__xmd_count__">0</span>
      </div>
      <div class="__xmd_panel_row__">
        <span class="__xmd_label__">Scroll</span>
        <span class="__xmd_count__" id="__xmd_scrolls__" style="font-size:13px;color:#888">0</span>
      </div>
      <div class="__xmd_divider__"></div>
      <div class="__xmd_btn_row__">
        <button class="__xmd_panel_btn__ __xmd_btn_collect__" id="__xmd_collect_btn__">
          ▶ Thu Thập
        </button>
        <button class="__xmd_panel_btn__ __xmd_btn_download__" id="__xmd_download_btn__" disabled>
          ↓ Download
        </button>
      </div>
      <div class="__xmd_scroll_info__" id="__xmd_scroll_info__">
        ⟳ Đang scroll tự động...
      </div>
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
  document.documentElement.appendChild(fab);

  // ─── State ───────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let isCollecting = false;
  let mediaCount = 0;

  const panel = document.getElementById('__xmd_panel__');
  const mainBtn = document.getElementById('__xmd_main_btn__');
  const badge = document.getElementById('__xmd_badge__');
  const countEl = document.getElementById('__xmd_count__');
  const scrollsEl = document.getElementById('__xmd_scrolls__');
  const collectBtn = document.getElementById('__xmd_collect_btn__');
  const downloadBtn = document.getElementById('__xmd_download_btn__');
  const scrollInfo = document.getElementById('__xmd_scroll_info__');

  // ─── Toggle Panel ────────────────────────────────────────────────────────────
  mainBtn.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.classList.toggle('visible', panelOpen);
  });

  // Đóng panel khi click ra ngoài
  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target)) {
      panelOpen = false;
      panel.classList.remove('visible');
    }
  }, true);

  // ─── Collect Button ──────────────────────────────────────────────────────────
  collectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollecting = !isCollecting;

    if (isCollecting) {
      collectBtn.textContent = '⏹ Dừng';
      collectBtn.classList.add('active');
      mainBtn.classList.add('collecting');
      scrollInfo.classList.add('visible');
      // Gửi lệnh START_COLLECTING qua custom event → content.js relay
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'START_COLLECTING' }
      }));
    } else {
      collectBtn.textContent = '▶ Thu Thập';
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'STOP_COLLECTING' }
      }));
    }
  });

  // ─── Download Button ─────────────────────────────────────────────────────────
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (downloadBtn.disabled) return;
    window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
      detail: { action: 'START_DOWNLOAD' }
    }));
    downloadBtn.textContent = '⏳ Đang tải...';
    downloadBtn.disabled = true;
  });

  // ─── Update từ messages ──────────────────────────────────────────────────────
  window.addEventListener('XMD_FAB_UPDATE', (e) => {
    const { count, scrollCount, state } = e.detail || {};

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
      collectBtn.textContent = '▶ Thu Thập';
      collectBtn.classList.remove('active');
      mainBtn.classList.remove('collecting');
      scrollInfo.classList.remove('visible');
    }

    if (state === 'DOWNLOAD_DONE') {
      downloadBtn.textContent = '↓ Download';
      downloadBtn.disabled = mediaCount === 0;
    }
  });

})();
