/**
 * toast.ts — Toast queue (UI-03) của popup (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: nhiều toast không override
 * nhau — xếp hàng FIFO, mỗi toast chờ hết duration rồi fade-out trước khi
 * hiện toast tiếp theo.
 */

interface QueuedToast {
  msg: string;
  type: string;
  duration: number;
}

const _toastQueue: QueuedToast[] = [];
let _toastActive = false;

export function showToast(msg: string, type = '', duration?: number): void {
  const dur = duration ?? (type === 'warning' ? 7000 : 3000);
  _toastQueue.push({ msg, type, duration: dur });
  if (!_toastActive) _drainToastQueue();
}

function _drainToastQueue(): void {
  const toast = document.getElementById('toast');
  if (_toastQueue.length === 0 || !toast) {
    _toastActive = false;
    return;
  }
  _toastActive = true;
  const { msg, type, duration } = _toastQueue.shift()!;
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.className = 'toast';
    // Đợi animation fade out (0.3s) rồi show toast tiếp
    setTimeout(_drainToastQueue, 350);
  }, duration);
}
