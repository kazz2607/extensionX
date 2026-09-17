/**
 * fab-css.ts — CSS của Floating Action Button (Pha 8 refactor).
 * Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */

export function injectFabStyle(): void {
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
}
