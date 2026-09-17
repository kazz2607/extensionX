/**
 * fab-drag.ts — FAB Draggable (v3.9.0), lưu vị trí qua localStorage (Pha 8 refactor).
 * Tách nguyên vẹn từ fab.ts, không đổi hành vi.
 */
import type { FabElements } from './fab-dom.ts';

const FAB_POS_KEY = '__xmd_fab_top_pct__';
const DRAG_THRESHOLD = 5; // px — nhỏ hơn ngưỡng này = click, không phải drag

export function initDrag(elements: FabElements, closePanel: () => void): void {
  const { fab, dragHandle } = elements;

  // Khôi phục vị trí đã lưu
  function restoreFabPosition(): void {
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
  function saveFabPosition(): void {
    try {
      const rect = fab.getBoundingClientRect();
      const pct = (rect.top / window.innerHeight) * 100;
      localStorage.setItem(FAB_POS_KEY, pct.toFixed(2));
    } catch (_) {}
  }

  // Clamp top trong viewport (tính theo px)
  function clampTop(topPx: number): number {
    const fabHeight = fab.offsetHeight || 100;
    const minTop = 8;
    const maxTop = window.innerHeight - fabHeight - 8;
    return Math.min(Math.max(topPx, minTop), maxTop);
  }

  // Áp dụng vị trí top bằng px
  function applyTop(topPx: number): void {
    fab.style.top = topPx + 'px';
    fab.style.bottom = 'auto';
  }

  // ── Mouse drag ──
  let isDragging = false;
  let hasMoved = false;
  let dragStartClientY = 0;
  let dragStartTopPx = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // chỉ chuột trái
    isDragging = true;
    hasMoved = false;
    dragStartClientY = e.clientY;
    dragStartTopPx = fab.getBoundingClientRect().top;

    fab.classList.add('dragging');
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
      closePanel();
    }

    if (hasMoved) {
      applyTop(clampTop(dragStartTopPx + delta));
    }
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove('dragging');
    dragHandle.classList.remove('grabbing');
    document.body.style.userSelect = '';

    if (hasMoved) {
      saveFabPosition();
    }
    hasMoved = false;
  });

  // ── Touch drag ──
  let touchId: number | null = null;
  let touchStartClientY = 0;
  let touchStartTopPx = 0;
  let touchHasMoved = false;

  dragHandle.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchId = touch.identifier;
    touchHasMoved = false;
    touchStartClientY = touch.clientY;
    touchStartTopPx = fab.getBoundingClientRect().top;

    fab.classList.add('dragging');
    dragHandle.classList.add('grabbing');
    e.preventDefault(); // ngăn scroll trang
    e.stopPropagation();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (touchId === null) return;
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchId);
    if (!touch) return;

    const delta = touch.clientY - touchStartClientY;

    if (!touchHasMoved && Math.abs(delta) >= DRAG_THRESHOLD) {
      touchHasMoved = true;
      closePanel();
    }

    if (touchHasMoved) {
      applyTop(clampTop(touchStartTopPx + delta));
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchId);
    if (!touch) return;
    touchId = null;
    fab.classList.remove('dragging');
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
}
