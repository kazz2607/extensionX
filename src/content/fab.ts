/**
 * fab.ts — Floating Action Button trên trang X.com
 * Hiển thị mini widget góc phải màn hình với:
 *   - Badge số lượng media đã thu thập
 *   - Nút Quick Collect / Stop
 *   - Nút Quick Download
 *   - [v3.9.0] Draggable theo trục Y, lưu vị trí qua localStorage
 *
 * Chạy trong EXTENSION ISOLATED WORLD (import từ content.ts), trong closed
 * shadow root — script của trang không đọc hay hook được FAB.
 * Pha 8: tách thành fab-css/fab-dom/fab-drag/fab-i18n/fab-events, file này chỉ
 * còn là entry point khởi tạo theo thứ tự — không đổi hành vi.
 */
import { injectFabStyle } from './fab-css.ts';
import { buildFabDom } from './fab-dom.ts';
import { initDrag } from './fab-drag.ts';
import { initFabEvents } from './fab-events.ts';
import { createClosedShadowRoot } from './shadow-host.ts';
import { watchXModals } from './x-modal-watch.ts';

(function () {
  'use strict';

  // Closed shadow root: page scripts cannot read the FAB (username, counts).
  // Null when already mounted, which also guards against double init.
  const root = createClosedShadowRoot('__xmd_fab_host__');
  if (!root) return;

  injectFabStyle(root);
  const elements = buildFabDom(root);
  const { closePanel } = initFabEvents(elements);
  initDrag(elements, closePanel);

  // U13: the FAB sits above everything, so step aside while X shows a
  // lightbox, compose box or dialog instead of covering its controls.
  const host = root.host as HTMLElement;
  watchXModals((open) => {
    host.style.display = open ? 'none' : '';
    if (open) closePanel();
  });
})();
