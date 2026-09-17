/**
 * fab.ts — Floating Action Button trên trang X.com
 * Hiển thị mini widget góc phải màn hình với:
 *   - Badge số lượng media đã thu thập
 *   - Nút Quick Collect / Stop
 *   - Nút Quick Download
 *   - [v3.9.0] Draggable theo trục Y, lưu vị trí qua localStorage
 *
 * Chạy trong EXTENSION ISOLATED WORLD (content script).
 * Pha 8: tách thành fab-css/fab-dom/fab-drag/fab-i18n/fab-events, file này chỉ
 * còn là entry point khởi tạo theo thứ tự — không đổi hành vi.
 */
import { injectFabStyle } from './fab-css.ts';
import { buildFabDom } from './fab-dom.ts';
import { initDrag } from './fab-drag.ts';
import { initFabEvents } from './fab-events.ts';

(function () {
  'use strict';

  // Tránh khởi tạo nhiều lần
  if (document.getElementById('__xmd_fab__')) return;

  injectFabStyle();
  const elements = buildFabDom();
  const { closePanel } = initFabEvents(elements);
  initDrag(elements, closePanel);
})();
