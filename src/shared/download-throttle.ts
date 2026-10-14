/**
 * download-throttle.ts — F4: giới hạn tốc độ tải để tránh bị X chặn (HTTP 429).
 *
 * - Số luồng song song 1–6.
 * - Nghỉ giữa hai file của cùng một luồng (0–10 giây).
 * - Khi gặp 429: mọi luồng tạm nghỉ, file bị chặn được xếp lại cuối hàng một
 *   lần thay vì tính là lỗi ngay.
 */
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 6;
export const DEFAULT_CONCURRENCY = 3;
export const MAX_DOWNLOAD_DELAY_MS = 10_000;
/** Thời gian mọi luồng tạm dừng sau một phản hồi 429. */
export const RATE_LIMIT_PAUSE_MS = 60_000;

export function clampConcurrency(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, n));
}

export function clampDownloadDelay(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(MAX_DOWNLOAD_DELAY_MS, Math.max(0, n));
}

/**
 * Cổng tạm dừng dùng chung cho các luồng của một lượt tải. Nhiều luồng cùng
 * gặp 429 không cộng dồn thời gian nghỉ — chỉ kéo dài tới mốc xa nhất.
 */
export class PauseGate {
  private until = 0;

  pause(now: number, ms: number): number {
    this.until = Math.max(this.until, now + ms);
    return this.until;
  }

  remaining(now: number): number {
    return Math.max(0, this.until - now);
  }
}
