/**
 * snackbar.js — Progress Snackbar trên trang X.com (v4.0.0)
 * Hiển thị tiến trình download dưới dạng snackbar mini ở giữa dưới màn hình.
 * Không cần mở popup để theo dõi tiến độ tải.
 *
 * Lắng nghe CustomEvent: XMD_SNACKBAR_UPDATE
 * Dispatch từ: content.js (relay từ service-worker)
 *
 * Chạy trong PAGE CONTEXT (được inject bởi content.js)
 */

(function () {
  'use strict';

  if (document.getElementById('__xmd_snackbar__')) return;

  // ─── CSS ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__xmd_snackbar_style__';
  style.textContent = `
    #__xmd_snackbar__ {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(120px);
      z-index: 2147483646;
      min-width: 340px;
      max-width: min(560px, calc(100vw - 40px));
      background: rgba(12, 12, 14, 0.92);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 16px;
      padding: 14px 18px 12px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(29,155,240,0.15);
      font-family: -apple-system, 'Inter', BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      color: #f0f0f0;
      pointer-events: all;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity  0.3s ease;
      opacity: 0;
      user-select: none;
    }

    #__xmd_snackbar__.visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    #__xmd_snackbar__.hiding {
      transform: translateX(-50%) translateY(120px);
      opacity: 0;
    }

    /* ── Header row ── */
    .__xmd_sb_header__ {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .__xmd_sb_title__ {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.75);
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .__xmd_sb_title__ span {
      color: #1D9BF0;
    }

    .__xmd_sb_close__ {
      width: 22px;
      height: 22px;
      border: none;
      background: rgba(255,255,255,0.08);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
      padding: 0;
    }

    .__xmd_sb_close__:hover {
      background: rgba(255,255,255,0.16);
      color: white;
    }

    /* ── Progress bar ── */
    .__xmd_sb_bar_wrap__ {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .__xmd_sb_bar__ {
      height: 100%;
      border-radius: 3px;
      background: linear-gradient(90deg, #1D9BF0, #a855f7);
      background-size: 200% 100%;
      transition: width 0.4s ease;
      position: relative;
    }

    /* Shimmer animation khi đang tải */
    .__xmd_sb_bar__.active {
      animation: __xmd_sb_shimmer__ 1.6s linear infinite;
    }

    @keyframes __xmd_sb_shimmer__ {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }

    /* ── Stats row ── */
    .__xmd_sb_stats__ {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .__xmd_sb_counter__ {
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      font-variant-numeric: tabular-nums;
    }

    .__xmd_sb_counter__ b {
      color: #1D9BF0;
      font-weight: 600;
    }

    .__xmd_sb_filename__ {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }

    /* ── Done state ── */
    #__xmd_snackbar__.done .__xmd_sb_bar_wrap__ {
      display: none;
    }

    #__xmd_snackbar__.done .__xmd_sb_stats__ {
      display: none;
    }

    #__xmd_snackbar__.done .__xmd_sb_header__ {
      margin-bottom: 0;
    }

    .__xmd_sb_done_msg__ {
      display: none;
      font-size: 12px;
      color: rgba(255,255,255,0.65);
      align-items: center;
      gap: 6px;
    }

    #__xmd_snackbar__.done .__xmd_sb_done_msg__ {
      display: flex;
    }

    .__xmd_sb_done_success__ { color: #00ba7c; font-weight: 600; }
    .__xmd_sb_done_failed__  { color: #f4212e; font-weight: 600; }
  `;
  document.documentElement.appendChild(style);

  // ─── HTML ────────────────────────────────────────────────────────────────────
  const sb = document.createElement('div');
  sb.id = '__xmd_snackbar__';
  sb.innerHTML = `
    <div class="__xmd_sb_header__">
      <div class="__xmd_sb_title__" id="__xmd_sb_title__">
        ⬇ Đang tải <span id="__xmd_sb_username__">...</span>
      </div>
      <button class="__xmd_sb_close__" id="__xmd_sb_close__" title="Đóng">✕</button>
    </div>
    <div class="__xmd_sb_bar_wrap__">
      <div class="__xmd_sb_bar__ active" id="__xmd_sb_bar__" style="width:0%"></div>
    </div>
    <div class="__xmd_sb_stats__">
      <div class="__xmd_sb_counter__" id="__xmd_sb_counter__">0 / 0</div>
      <div class="__xmd_sb_filename__" id="__xmd_sb_filename__"></div>
    </div>
    <div class="__xmd_sb_done_msg__" id="__xmd_sb_done_msg__"></div>
  `;
  document.documentElement.appendChild(sb);

  // ─── Elements ────────────────────────────────────────────────────────────────
  const titleEl    = document.getElementById('__xmd_sb_title__');
  const usernameEl = document.getElementById('__xmd_sb_username__');
  const closeBtn   = document.getElementById('__xmd_sb_close__');
  const barEl      = document.getElementById('__xmd_sb_bar__');
  const counterEl  = document.getElementById('__xmd_sb_counter__');
  const filenameEl = document.getElementById('__xmd_sb_filename__');
  const doneMsgEl  = document.getElementById('__xmd_sb_done_msg__');

  // ─── State ───────────────────────────────────────────────────────────────────
  let autoDismissTimer = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function show() {
    clearTimeout(autoDismissTimer);
    sb.classList.remove('hiding', 'done');
    // Force reflow để restart animation nếu đang hiding
    void sb.offsetWidth;
    sb.classList.add('visible');
  }

  function hide(immediate = false) {
    clearTimeout(autoDismissTimer);
    if (immediate) {
      sb.classList.remove('visible');
      sb.classList.remove('hiding');
    } else {
      sb.classList.add('hiding');
      setTimeout(() => {
        sb.classList.remove('visible', 'hiding');
      }, 350);
    }
  }

  function autoDismiss(ms = 3000) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = setTimeout(() => hide(), ms);
  }

  // ─── Event: close button ─────────────────────────────────────────────────────
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hide();
  });

  // ─── Event: XMD_SNACKBAR_UPDATE ──────────────────────────────────────────────
  window.addEventListener('XMD_SNACKBAR_UPDATE', (e) => {
    const data = e.detail || {};

    switch (data.type) {

      case 'DOWNLOAD_STARTED': {
        // Reset về trạng thái downloading
        sb.classList.remove('done');
        titleEl.innerHTML = '⬇ Đang tải <span id="__xmd_sb_username__">' +
          (data.username ? '@' + data.username : '') + '</span>';
        barEl.style.width = '0%';
        barEl.classList.add('active');
        counterEl.textContent = '0 / ' + (data.total || 0);
        filenameEl.textContent = '';
        doneMsgEl.innerHTML = '';
        show();
        break;
      }

      case 'DOWNLOAD_PROGRESS': {
        const pct   = Math.min(data.percent || 0, 100);
        const cur   = data.current  || 0;
        const total = data.total    || 0;
        const ok    = data.success  || 0;
        const fail  = data.failed   || 0;

        barEl.style.width = pct + '%';

        // Counter
        if (fail > 0) {
          counterEl.innerHTML =
            '<b>' + pct + '%</b>&nbsp;&nbsp;' +
            cur + ' / ' + total +
            ' &nbsp;(<span style="color:#f4212e">✗ ' + fail + '</span>)';
        } else {
          counterEl.innerHTML = '<b>' + pct + '%</b>&nbsp;&nbsp;' + cur + ' / ' + total;
        }

        // Tên file đang tải
        if (data.currentFile) {
          filenameEl.textContent = data.currentFile;
        }

        // Nếu đây là update cuối (done = true từ PROGRESS)
        if (data.done) {
          barEl.style.width = '100%';
        }
        break;
      }

      case 'DOWNLOAD_DONE': {
        const ok    = data.success || 0;
        const fail  = data.failed  || 0;
        const total = data.total   || 0;

        barEl.style.width = '100%';
        barEl.classList.remove('active');
        sb.classList.add('done');

        // Compose done message
        let msg = '✅ &nbsp;<span class="__xmd_sb_done_success__">' + ok + ' file</span>';
        if (data.username) msg += ' từ @' + data.username;
        if (fail > 0) {
          msg += ' &nbsp;—&nbsp; <span class="__xmd_sb_done_failed__">✗ ' + fail + ' lỗi</span>';
        }
        doneMsgEl.innerHTML = msg;

        // Auto-dismiss sau 3.5s
        autoDismiss(3500);
        break;
      }
    }
  });

})();
