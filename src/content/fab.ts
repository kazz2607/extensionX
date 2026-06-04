/**
 * fab.js — Floating Action Button trên trang X.com
 * Hiển thị mini widget góc phải màn hình với:
 *   - Badge số lượng media đã thu thập
 *   - Nút Quick Collect / Stop
 *   - Nút Quick Download
 *   - [v3.9.0] Draggable theo trục Y, lưu vị trí qua localStorage
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
      top: 60%;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      font-family: -apple-system, 'Inter', BlinkMacSystemFont, sans-serif;
      pointer-events: none;
      /* Smooth transition chỉ khi không đang kéo */
      transition: top 0s;
    }

    #__xmd_fab__.dragging {
      transition: none !important;
    }

    #__xmd_fab__ * { box-sizing: border-box; }

    /* ── Drag Handle ── */
    #__xmd_drag_handle__ {
      width: 36px;
      height: 16px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: all;
      transition: background 0.15s, border-color 0.15s;
      align-self: auto;
      user-select: none;
      -webkit-user-select: none;
      margin-bottom: 10px;
    }

    #__xmd_drag_handle__:hover {
      background: rgba(29,155,240,0.22);
      border-color: rgba(29,155,240,0.35);
    }

    #__xmd_drag_handle__.grabbing {
      cursor: grabbing;
      background: rgba(29,155,240,0.3);
      border-color: rgba(29,155,240,0.5);
    }

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

    .__xmd_btn_icon__ {
      width: 13px;
      height: 13px;
      flex: 0 0 13px;
      stroke: currentColor;
    }

    .__xmd_icon_stop__ { display: none; }
    .__xmd_btn_collect__.active .__xmd_icon_play__ { display: none; }
    .__xmd_btn_collect__.active .__xmd_icon_stop__ { display: block; }

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

    /* Ẩn hover effect khi đang kéo */
    #__xmd_fab__.dragging #__xmd_main_btn__:hover { transform: none; }

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
        <span class="__xmd_label__" id="__xmd_lbl_media__">Media thu thập</span>
        <span class="__xmd_count__" id="__xmd_count__">0</span>
      </div>
      <div class="__xmd_panel_row__">
        <span class="__xmd_label__" id="__xmd_lbl_scroll__">Scroll</span>
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
          <span class="__xmd_btn_text__">Thu Thập</span>
        </button>
        <button class="__xmd_panel_btn__ __xmd_btn_download__" id="__xmd_download_btn__" disabled>
          <svg class="__xmd_btn_icon__" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12"/>
            <path d="m7 10 5 5 5-5"/>
            <path d="M5 21h14"/>
          </svg>
          <span class="__xmd_btn_text__">Download</span>
        </button>
      </div>
      <div class="__xmd_scroll_info__" id="__xmd_scroll_info__">
        ⟳ Đang scroll tự động...
      </div>
    </div>
    <div id="__xmd_drag_handle__" title="Kéo để di chuyển">
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
  document.documentElement.appendChild(fab);

  // ─── State ───────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let isCollecting = false;
  let isDownloading = false;  // FIX: flag riêng cho download, độc lập với downloadBtn.disabled
  let mediaCount = 0;

  const panel      = document.getElementById('__xmd_panel__');
  const mainBtn    = document.getElementById('__xmd_main_btn__');
  const badge      = document.getElementById('__xmd_badge__');
  const countEl    = document.getElementById('__xmd_count__');
  const scrollsEl  = document.getElementById('__xmd_scrolls__');
  const collectBtn = document.getElementById('__xmd_collect_btn__');
  const downloadBtn= document.getElementById('__xmd_download_btn__');
  const scrollInfo = document.getElementById('__xmd_scroll_info__');
  const lblMedia   = document.getElementById('__xmd_lbl_media__');
  const lblScroll  = document.getElementById('__xmd_lbl_scroll__');
  const dragHandle = document.getElementById('__xmd_drag_handle__');

// @ts-ignore
  function panelButtonLabel(rawLabel) {
    return String(rawLabel || '').replace(/^(?:[▶⏹↓⏳⟳]\s*)+/u, '').trim();
  }

// @ts-ignore
  function setPanelButtonText(button, label) {
    const textEl = button.querySelector('.__xmd_btn_text__');
    if (textEl) textEl.textContent = panelButtonLabel(label);
  }

  // Hàm update text i18n
  function updateFabI18n() {
    if (!window.i18n) return;
// @ts-ignore
    lblMedia.textContent = window.i18n.t('fab_media_collected');
// @ts-ignore
    lblScroll.textContent = window.i18n.t('fab_scroll');
    setPanelButtonText(collectBtn, isCollecting ? window.i18n.t('fab_collect_stop') : window.i18n.t('fab_collect_start'));
    // BUG-F FIX: Dùng isDownloading flag thay vì check text content (ngược logic cũ)
    // text.includes('...') không tin cậy — nếu đang download thì không overwrite bằng text idle
    setPanelButtonText(downloadBtn, isDownloading
      ? window.i18n.t('fab_downloading')
      : window.i18n.t('fab_download'));
// @ts-ignore
    scrollInfo.textContent = window.i18n.t('fab_scrolling');
  }

  window.addEventListener('XMD_LANG_UPDATE', (e) => {
// @ts-ignore
    if (window.i18n && e.detail?.lang) {
// @ts-ignore
      window.i18n.lang = e.detail.lang;
      updateFabI18n();
    }
  });

  // ─── Toggle Panel ────────────────────────────────────────────────────────────
// @ts-ignore
  mainBtn.addEventListener('click', () => {
    // Nếu đang download: bấm vào main btn = toggle panel (xem tiến độ)
    if (isDownloading) {
      panelOpen = !panelOpen;
// @ts-ignore
      panel.classList.toggle('visible', panelOpen);
      return;
    }
    // Nếu có media và chưa đang download: bấm main btn = download luôn
    if (mediaCount > 0) {
      isDownloading = true;
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'START_DOWNLOAD' }
      }));
      setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_downloading') : '⏳ Đang tải...');
// @ts-ignore
      downloadBtn.disabled = true;
      // Đóng panel nếu đang mở
      panelOpen = false;
// @ts-ignore
      panel.classList.remove('visible');
      return;
    }
    // Chưa có media: toggle panel để dùng nút Thu Thập
    panelOpen = !panelOpen;
// @ts-ignore
    panel.classList.toggle('visible', panelOpen);
  });

  // Đóng panel khi click ra ngoài
  document.addEventListener('click', (e) => {
// @ts-ignore
    if (!fab.contains(e.target)) {
      panelOpen = false;
// @ts-ignore
      panel.classList.remove('visible');
    }
  }, true);

  // ─── Collect Button ──────────────────────────────────────────────────────────
// @ts-ignore
  collectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollecting = !isCollecting;

    if (isCollecting) {
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_stop') : '⏹ Dừng');
// @ts-ignore
      collectBtn.classList.add('active');
// @ts-ignore
      mainBtn.classList.add('collecting');
// @ts-ignore
      scrollInfo.classList.add('visible');
      // Gửi lệnh START_COLLECTING qua custom event → content.js relay
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'START_COLLECTING' }
      }));
    } else {
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
// @ts-ignore
      collectBtn.classList.remove('active');
// @ts-ignore
      mainBtn.classList.remove('collecting');
// @ts-ignore
      scrollInfo.classList.remove('visible');
      window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
        detail: { action: 'STOP_COLLECTING' }
      }));
    }
  });

  // ─── Download Button ─────────────────────────────────────────────────────────
// @ts-ignore
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
// @ts-ignore
    if (downloadBtn.disabled || isDownloading) return;
    isDownloading = true;
    window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', {
      detail: { action: 'START_DOWNLOAD' }
    }));
    setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_downloading') : '⏳ Đang tải...');
// @ts-ignore
    downloadBtn.disabled = true;
  });

  // ─── Update từ messages ──────────────────────────────────────────────────────
  window.addEventListener('XMD_FAB_UPDATE', (e) => {
// @ts-ignore
    const { count, scrollCount, state } = e.detail || {};

    if (count !== undefined) {
      mediaCount = count;
// @ts-ignore
      countEl.textContent = count;
// @ts-ignore
      badge.textContent = count > 999 ? '999+' : String(count);
// @ts-ignore
      badge.style.display = count > 0 ? 'flex' : 'none';
// @ts-ignore
      downloadBtn.disabled = count === 0;
    }

    if (scrollCount !== undefined) {
// @ts-ignore
      scrollsEl.textContent = scrollCount;
    }

    if (state === 'COLLECT_DONE') {
      isCollecting = false;
      setPanelButtonText(collectBtn, window.i18n ? window.i18n.t('fab_collect_start') : '▶ Thu Thập');
// @ts-ignore
      collectBtn.classList.remove('active');
// @ts-ignore
      mainBtn.classList.remove('collecting');
// @ts-ignore
      scrollInfo.classList.remove('visible');
    }

    if (state === 'DOWNLOAD_DONE') {
      isDownloading = false;  // FIX: reset flag để cho phép download lần tiếp
      setPanelButtonText(downloadBtn, window.i18n ? window.i18n.t('fab_download') : '↓ Download');
// @ts-ignore
      downloadBtn.disabled = mediaCount === 0;
    }
  });

  // ─── FAB Draggable (v3.9.0) ──────────────────────────────────────────────────
  const FAB_POS_KEY = '__xmd_fab_top_pct__';
  const DRAG_THRESHOLD = 5; // px — nhỏ hơn ngưỡng này = click, không phải drag

  // Khôi phục vị trí đã lưu
  function restoreFabPosition() {
    try {
      const saved = localStorage.getItem(FAB_POS_KEY);
      if (saved !== null) {
        const pct = parseFloat(saved);
        if (!isNaN(pct)) {
          // Clamp an toàn: không vượt ra ngoài viewport
          const safePct = Math.min(Math.max(pct, 3), 82);
          fab.style.top = safePct + '%';
          fab.style.bottom = 'auto';
        }
      }
    } catch (_) {}
  }

  // Lưu vị trí hiện tại (tính theo % của viewport height)
  function saveFabPosition() {
    try {
      const rect = fab.getBoundingClientRect();
      const pct = (rect.top / window.innerHeight) * 100;
      localStorage.setItem(FAB_POS_KEY, pct.toFixed(2));
    } catch (_) {}
  }

  // Clamp top trong viewport (tính theo px)
// @ts-ignore
  function clampTop(topPx) {
    const fabHeight = fab.offsetHeight || 100;
    const minTop = 8;
    const maxTop = window.innerHeight - fabHeight - 8;
    return Math.min(Math.max(topPx, minTop), maxTop);
  }

  // Áp dụng vị trí top bằng px
// @ts-ignore
  function applyTop(topPx) {
    fab.style.top = topPx + 'px';
    fab.style.bottom = 'auto';
  }

  // ── Mouse drag ──
  let isDragging = false;
  let hasMoved = false;
  let dragStartClientY = 0;
  let dragStartTopPx = 0;

// @ts-ignore
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // chỉ chuột trái
    isDragging = true;
    hasMoved = false;
    dragStartClientY = e.clientY;
    dragStartTopPx = fab.getBoundingClientRect().top;

    fab.classList.add('dragging');
// @ts-ignore
    dragHandle.classList.add('grabbing');
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = e.clientY - dragStartClientY;

    if (!hasMoved && Math.abs(delta) >= DRAG_THRESHOLD) {
      hasMoved = true;
      // Đóng panel ngay khi bắt đầu kéo
      panelOpen = false;
// @ts-ignore
      panel.classList.remove('visible');
    }

    if (hasMoved) {
      applyTop(clampTop(dragStartTopPx + delta));
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove('dragging');
// @ts-ignore
    dragHandle.classList.remove('grabbing');
    document.body.style.userSelect = '';

    if (hasMoved) {
      saveFabPosition();
    }
    hasMoved = false;
  });

  // ── Touch drag ──
// @ts-ignore
  let touchId = null;
  let touchStartClientY = 0;
  let touchStartTopPx = 0;
  let touchHasMoved = false;

// @ts-ignore
  dragHandle.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchId = touch.identifier;
    touchHasMoved = false;
    touchStartClientY = touch.clientY;
    touchStartTopPx = fab.getBoundingClientRect().top;

    fab.classList.add('dragging');
// @ts-ignore
    dragHandle.classList.add('grabbing');
    e.preventDefault(); // ngăn scroll trang
    e.stopPropagation();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
// @ts-ignore
    if (touchId === null) return;
// @ts-ignore
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
    if (!touch) return;

    const delta = touch.clientY - touchStartClientY;

    if (!touchHasMoved && Math.abs(delta) >= DRAG_THRESHOLD) {
      touchHasMoved = true;
      panelOpen = false;
// @ts-ignore
      panel.classList.remove('visible');
    }

    if (touchHasMoved) {
      applyTop(clampTop(touchStartTopPx + delta));
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
// @ts-ignore
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
    if (!touch) return;
    touchId = null;
    fab.classList.remove('dragging');
// @ts-ignore
    dragHandle.classList.remove('grabbing');

    if (touchHasMoved) {
      saveFabPosition();
    }
    touchHasMoved = false;
  });

  // ── Re-clamp khi resize window ──
  window.addEventListener('resize', () => {
    const rect = fab.getBoundingClientRect();
    const clamped = clampTop(rect.top);
    if (Math.abs(clamped - rect.top) > 1) {
      applyTop(clamped);
      saveFabPosition();
    }
  });

  // Khôi phục vị trí ngay khi khởi tạo
  restoreFabPosition();

})();
