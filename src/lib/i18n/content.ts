/**
 * Strings for UI injected into web pages: FAB, snackbar, tweet button (X.com),
 * keyboard-shortcut toasts and the Telegram Web download buttons.
 *
 * This file must stay free of side effects and of chrome.* APIs: the MAIN-world
 * tweet button imports it directly (it cannot use src/lib/i18n.ts).
 */
import type { TranslationTable } from '../i18n.ts';
import { translate, type TranslationVars } from '../i18n-format.ts';

// Separate tables per surface: each content script bundles only its own strings.
/** FAB and snackbar on X.com (isolated world, content.ts). */
export const X_UI_STRINGS: TranslationTable = {
  en: {
    fab_media_collected: 'Media collected',
    fab_scroll: 'Scroll',
    fab_collect_start: '▶ Collect',
    fab_collect_stop: '⏹ Stop',
    fab_download: '↓ Download',
    fab_downloading: '⏳ Loading...',
    fab_scrolling: '⟳ Auto-scrolling...',
    fab_drag_handle: 'Drag to move',

    // Snackbar
    sb_title_downloading: '⬇ Downloading',
    sb_close: 'Close',
    sb_rate_limited: 'X is rate limiting — pausing {seconds}s, then resuming',
    sb_done_files: '{count} file(s)',
    sb_done_from: ' from @{username}',
    sb_done_failed: '✗ {count} failed',

    // Tweet button (MAIN world)
  },
  vi: {
    fab_media_collected: 'Media thu thập',
    fab_scroll: 'Scroll',
    fab_collect_start: '▶ Thu Thập',
    fab_collect_stop: '⏹ Dừng',
    fab_download: '↓ Download',
    fab_downloading: '⏳ Đang tải...',
    fab_scrolling: '⟳ Đang scroll tự động...',
    fab_drag_handle: 'Kéo để di chuyển',

    // Snackbar
    sb_title_downloading: '⬇ Đang tải',
    sb_close: 'Đóng',
    sb_rate_limited: 'X đang giới hạn tốc độ — nghỉ {seconds} giây rồi tải tiếp',
    sb_done_files: '{count} file',
    sb_done_from: ' từ @{username}',
    sb_done_failed: '✗ {count} lỗi',

    // Tweet button (MAIN world)
  },
};

/** Per-tweet download button (MAIN world, main-world.ts). */
export const TWEET_BUTTON_STRINGS: TranslationTable = {
  en: {
    tb_idle_title: 'Download media (X Media Downloader)',
    tb_idle_aria: 'Download tweet media',
    tb_loading: 'Downloading...',
    tb_done: 'Downloaded! ✓',
    tb_error: 'Error! Try again',

    // Keyboard shortcut toasts
  },
  vi: {
    tb_idle_title: 'Tải media (X Media Downloader)',
    tb_idle_aria: 'Tải media của tweet',
    tb_loading: 'Đang tải...',
    tb_done: 'Đã tải xong! ✓',
    tb_error: 'Lỗi! Thử lại',

    // Keyboard shortcut toasts
  },
};

/** Keyboard shortcut toasts on X.com (shortcuts.ts). */
export const SHORTCUT_STRINGS: TranslationTable = {
  en: {
    sc_copied_link: '✓ Copied link: {url}',
    sc_download_blocked: '✗ Download blocked',
    sc_downloading: '⬇ Downloading...',
    sc_opened_new_tab: '⬇ Opened in new tab',
    sc_copied_image_url: '✓ Copied image URL: {url}',
    sc_opened_original: '🌐 Opened original image',
    sc_opening_lens: '🔍 Opening Google Lens...',

    // Telegram Web
  },
  vi: {
    sc_copied_link: '✓ Đã copy liên kết: {url}',
    sc_download_blocked: '✗ Tải xuống bị chặn',
    sc_downloading: '⬇ Đang tải...',
    sc_opened_new_tab: '⬇ Đã mở trong tab mới',
    sc_copied_image_url: '✓ Đã copy URL ảnh: {url}',
    sc_opened_original: '🌐 Đã mở ảnh gốc',
    sc_opening_lens: '🔍 Đang mở Google Lens...',

    // Telegram Web
  },
};

/** Telegram Web download buttons (tg-content.ts). */
export const TELEGRAM_STRINGS: TranslationTable = {
  en: {
    tg_btn_title: 'Download (X Media Downloader)',
    tg_btn_aria_video: 'Download Telegram video',
    tg_btn_aria_image: 'Download Telegram photo',
    tg_viewer_btn_title: 'Download the media being viewed (X Media Downloader)',
    tg_viewer_btn_aria: 'Download the Telegram media being viewed',
    tg_loading: 'Downloading…',
    tg_loading_percent: 'Downloading… {percent}%',
    tg_download_started: 'Download started',
    tg_download_failed: 'Could not download',
    tg_stream_failed: 'Could not download the video: {reason}',
    tg_stale_extension: 'The extension was just updated — reload (F5) the Telegram tab and try again',
    tg_main_not_ready: 'tg-main is not ready — reload the Telegram tab',
    tg_video_not_ready: 'Video not ready yet — wait for the video to start loading, then try again',
    tg_err_invalid_url: 'Invalid stream URL',
    tg_err_already_downloading: 'This video is already being downloaded',
    tg_err_chunk_failed: 'Could not download a video segment',
    tg_err_range_unsupported: 'The response does not support resuming mid-file (Range)',
    tg_err_bad_content_range: 'Invalid Content-Range',
    tg_err_unknown_size: 'Could not determine the video size',
    tg_err_size_changed: 'The video size changed during download',
    tg_err_truncated: 'A video segment was truncated',
  },
  vi: {
    tg_btn_title: 'Tải xuống (X Media Downloader)',
    tg_btn_aria_video: 'Tải video Telegram',
    tg_btn_aria_image: 'Tải ảnh Telegram',
    tg_viewer_btn_title: 'Tải media đang xem (X Media Downloader)',
    tg_viewer_btn_aria: 'Tải media Telegram đang xem',
    tg_loading: 'Đang tải…',
    tg_loading_percent: 'Đang tải… {percent}%',
    tg_download_started: 'Đã bắt đầu tải xuống',
    tg_download_failed: 'Không thể tải xuống',
    tg_stream_failed: 'Không tải được video: {reason}',
    tg_stale_extension: 'Extension vừa được cập nhật — hãy tải lại (F5) tab Telegram rồi thử lại',
    tg_main_not_ready: 'tg-main chưa sẵn sàng — hãy tải lại tab Telegram',
    tg_video_not_ready: 'Video chưa sẵn sàng — chờ video bắt đầu tải rồi thử lại',
    tg_err_invalid_url: 'URL stream không hợp lệ',
    tg_err_already_downloading: 'Video này đang được tải',
    tg_err_chunk_failed: 'Không tải được đoạn video',
    tg_err_range_unsupported: 'Phản hồi không hỗ trợ Range giữa chừng',
    tg_err_bad_content_range: 'Content-Range không hợp lệ',
    tg_err_unknown_size: 'Không xác định được dung lượng video',
    tg_err_size_changed: 'Dung lượng video thay đổi giữa chừng',
    tg_err_truncated: 'Đoạn video bị cắt cụt',
  },
};

/**
 * Pure lookup for scripts that must not use the shared i18n module: the
 * MAIN-world tweet button (no chrome.*), and shortcuts.ts, which shares X's
 * isolated world with content.ts and would otherwise replace content.ts's
 * window.i18n instance with its own copy.
 */
export function translateFrom(table: TranslationTable, lang: string, key: string, vars?: TranslationVars): string {
  return translate(table, lang, key, vars);
}
