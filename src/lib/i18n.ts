/**
 * i18n.ts — Custom Internationalization Module
 * Quản lý đa ngôn ngữ cho extension (Popup, Options, Content Scripts)
 */

export interface I18nAPI {
  load: () => Promise<void>;
  t: (key: string) => string;
  applyToDOM: (root?: Document | HTMLElement) => void;
  lang: string;
}

declare global {
  interface Window {
// @ts-ignore
    i18n?: I18nAPI;
  }
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    // Popup
    profile_no_selection: 'Not selected',
    profile_hint_default: 'Open a profile on X.com to start',
    profile_hint_active: 'Profile being viewed',
    tab_all: 'All',
    tab_images: 'Images',
    tab_videos: 'Videos',
    tab_gifs: 'GIFs',
    status_ready: 'Ready',
    btn_collect_start: 'Start Collecting',
    btn_collect_stop: 'Stop Collecting',
    btn_download: 'Download',
    btn_csv: 'CSV',
    history_title: 'History',
    history_empty: 'No download history',
    history_clear: 'Clear',
    status_collecting: 'Collecting media...',
    status_stopped: 'Stopped',
    status_done: 'Done',
    status_downloading: 'Preparing download...',
    scroll_stats: 'Scroll:',
    scroll_new: 'New:',
    folder_prefix: 'Downloads/',
    
    // Options
    settings_title: 'Extension Settings',
    section_folder: '📁 Save Folder',
    opt_base_folder: 'Base folder',
    opt_base_folder_desc: 'Subfolder inside Downloads to save media. Leave empty to save directly to Downloads.',
    opt_flat_username: 'Merge into username folder',
    opt_flat_username_desc: 'Save all media directly inside the username folder without separating into images/videos/gifs subfolders.',
    section_media: '🎬 Media Type',
    opt_media_types: 'Media types to download',
    opt_media_images: 'Images',
    opt_media_videos: 'Videos',
    opt_media_gifs: 'GIFs',
    opt_img_quality: 'Image quality',
    opt_img_orig: 'Original (Best)',
    opt_img_large: 'Large',
    section_scroll: '🔄 Auto Scroll',
    opt_auto_scroll: 'Auto scroll on /media page',
    opt_auto_scroll_desc: 'Automatically start scrolling when visiting a user\'s /media tab.',
    opt_scroll_delay: 'Scroll delay (seconds)',
    opt_scroll_delay_desc: 'Time to wait between scrolls. Increase if internet is slow.',
    opt_max_scrolls: 'Max scrolls',
    opt_max_scrolls_desc: 'Maximum number of scrolls per profile. 0 = unlimited.',
    opt_adaptive_scroll: 'Adaptive scroll speed',
    opt_adaptive_scroll_desc: 'Dynamically adjust delay based on network speed (GraphQL response time).',
    section_download: '⬇ Download',
    opt_concurrency: 'Concurrent downloads',
    opt_concurrency_desc: 'Download multiple files at once for faster speed (recommended: 3)',
    opt_max_media: 'Max media per profile',
    opt_max_media_desc: 'Limit the number of media to collect. 0 = unlimited.',
    opt_save_as: 'Ask where to save each file',
    opt_save_as_desc: 'Enable to let Chrome ask where to save every single file (not recommended)',
    opt_filename_username: '📝 Filename: Username_TweetID_Serial',
    opt_filename_username_desc: 'Save filename with format:',
    section_security: '🔒 Security',
    opt_local_only: 'Local processing only',
    opt_local_only_desc: 'Does not send any data to external servers',
    section_appearance: '🎨 Appearance',
    opt_language: 'Language',
    opt_language_desc: 'Display language for the extension UI',
    opt_theme: 'Theme',
    opt_theme_desc: 'Toggle dark / light mode',
    btn_save: '💾 Save Settings',
    save_success: '✓ Saved successfully',
    
    // FAB
    fab_media_collected: 'Media collected',
    fab_scroll: 'Scroll',
    fab_collect_start: '▶ Collect',
    fab_collect_stop: '⏹ Stop',
    fab_download: '↓ Download',
    fab_downloading: '⏳ Loading...',
    fab_scrolling: '⟳ Auto-scrolling...',

    // V4.x additions
    opt_skip_duplicates: 'Skip downloaded',
    btn_compact_title: 'Compact mode',
    date_range_title: 'Date Range',
    date_from: 'From',
    date_to: 'To',
    keyword_label: 'Keyword / Hashtag',
    keyword_placeholder: 'e.g. #space or cats',
    date_preset_7: '7 days',
    date_preset_30: '30 days',
    date_preset_90: '3 months',
    date_preset_year: 'This year',
    filter_summary: '0 items match',
    queue_title: 'Download Queue',
    queue_start: 'Start',
    queue_clear: 'Clear',
    btn_add_queue: 'Add current profile to queue',
    queue_empty_msg: 'Queue is empty<br><small>Add profiles to queue for unsupervised sequential downloading</small>',
    nav_main: 'Main',
    nav_queue: 'Queue',
    nav_stats: 'Stats',
    stats_title: 'Media Breakdown',
    stat_total: 'Total',
    stat_images: 'Images',
    stat_videos: 'Videos',
    stat_gifs: 'GIFs',
    stat_hls: 'HLS',
    
    // Options
    opt_smart_filters: '🔍 Smart Filters',
    opt_filter_avatar: 'Filter avatars & banners',
    opt_filter_card: 'Filter link preview images (Cards)',
    opt_min_size: 'Minimum image size (px)',
    opt_min_size_desc: 'Ignore images with width or height smaller than this value. Only applies when X.com returns size metadata. Set to 0 to disable.',
    opt_snackbar: '🔔 Show progress on page (Snackbar)',
    opt_snackbar_desc: 'Show a mini progress bar right on the X.com page while downloading — no need to keep the popup open.',
    opt_notification: '🔔 Show completion notification',
    opt_notification_desc: 'Show a browser notification (Chrome Notification) when a task finishes.',
    opt_enable_bookmarks: '🔖 Bookmarks Scraper',
    opt_enable_bookmarks_desc: 'Allow scraping the /i/bookmarks page to collect media from your personal bookmarks. Disable if you do not use this feature.',
    opt_img_large_1200: 'Large (1200px)',
    opt_img_medium: 'Medium (600px)',
    opt_img_small: 'Small (300px)',
    opt_theme_system: 'System (Auto) 🌓',
    opt_theme_dark: 'Dark Mode 🌙',
    opt_theme_light: 'Light Mode ☀️',
    section_data: '⚙️ Data & Settings',
    opt_export: 'Export Settings',
    opt_export_desc: 'Export all settings to a JSON file — useful for backups or moving to another computer.',
    opt_import: 'Import Settings',
    opt_import_desc: 'Load a previously exported JSON file. Current settings will be overwritten.',
    opt_reset: 'Reset to Default',
    opt_reset_desc: 'Reset all settings to their default values. This action cannot be undone.',
    btn_export: '📤 Export',
    btn_import: '📥 Import',
    btn_reset: '🔄 Reset',

  },
  vi: {
    // Popup
    profile_no_selection: 'Chưa chọn profile',
    profile_hint_default: 'Mở profile trên X.com để bắt đầu',
    profile_hint_active: 'Profile đang được xem',
    tab_all: 'Tất cả',
    tab_images: 'Ảnh',
    tab_videos: 'Video',
    tab_gifs: 'GIF',
    status_ready: 'Sẵn sàng',
    btn_collect_start: 'Bắt đầu Thu Thập',
    btn_collect_stop: 'Dừng Thu Thập',
    btn_download: 'Download',
    btn_csv: 'CSV',
    history_title: 'Lịch sử',
    history_empty: 'Chưa có lịch sử tải',
    history_clear: 'Xóa',
    status_collecting: 'Đang thu thập media...',
    status_stopped: 'Đã dừng',
    status_done: 'Hoàn tất',
    status_downloading: 'Chuẩn bị download...',
    scroll_stats: 'Scroll:',
    scroll_new: 'Mới:',
    folder_prefix: 'Downloads/',
    
    // Options
    settings_title: 'Cài đặt Extension',
    section_folder: '📁 Thư Mục Lưu File',
    opt_base_folder: 'Thư mục cơ sở',
    opt_base_folder_desc: 'Thư mục con bên trong Downloads để lưu media. Để trống để lưu thẳng vào Downloads.',
    opt_flat_username: 'Lưu chung vào 1 thư mục theo Username',
    opt_flat_username_desc: 'Lưu chung tất cả media vào thư mục username, không chia thư mục con (images/videos/gifs).',
    section_media: '🎬 Loại Media',
    opt_media_types: 'Loại media cần tải',
    opt_media_images: 'Ảnh',
    opt_media_videos: 'Video',
    opt_media_gifs: 'GIF',
    opt_img_quality: 'Chất lượng ảnh',
    opt_img_orig: 'Gốc (Tốt nhất)',
    opt_img_large: 'Lớn',
    section_scroll: '🔄 Auto Scroll',
    opt_auto_scroll: 'Tự động scroll khi mở trang /media',
    opt_auto_scroll_desc: 'Tự động bắt đầu thu thập khi vào tab /media của người dùng.',
    opt_scroll_delay: 'Tốc độ scroll (giây)',
    opt_scroll_delay_desc: 'Thời gian chờ giữa 2 lần scroll. Tăng lên nếu mạng chậm.',
    opt_max_scrolls: 'Số lần scroll tối đa',
    opt_max_scrolls_desc: 'Giới hạn số lần cuộn trang. 0 = không giới hạn.',
    opt_adaptive_scroll: 'Tốc độ cuộn thích ứng (Adaptive)',
    opt_adaptive_scroll_desc: 'Tự động điều chỉnh thời gian chờ cuộn trang dựa trên tốc độ mạng.',
    section_download: '⬇ Download',
    opt_concurrency: 'Số file tải đồng thời',
    opt_concurrency_desc: 'Tải nhiều file cùng lúc để nhanh hơn (khuyên dùng: 3)',
    opt_max_media: 'Số media tối đa mỗi profile',
    opt_max_media_desc: 'Giới hạn số lượng cần thu thập. 0 = không giới hạn',
    opt_save_as: 'Hỏi vị trí lưu mỗi file',
    opt_save_as_desc: 'Bật để Chrome hỏi nơi lưu từng file (không khuyên dùng)',
    opt_filename_username: '📝 Tên file theo Username_TweetID_Serial',
    opt_filename_username_desc: 'Lưu tên file theo định dạng:',
    section_security: '🔒 Bảo Mật',
    opt_local_only: 'Chỉ xử lý cục bộ',
    opt_local_only_desc: 'Không gửi bất kỳ dữ liệu nào ra server ngoài',
    section_appearance: '🎨 Giao Diện',
    opt_language: 'Ngôn ngữ',
    opt_language_desc: 'Ngôn ngữ hiển thị của tiện ích',
    opt_theme: 'Giao diện',
    opt_theme_desc: 'Chuyển đổi giao diện Tối / Sáng',
    btn_save: '💾 Lưu cài đặt',
    save_success: '✓ Đã lưu thành công',
    
    // FAB
    fab_media_collected: 'Media thu thập',
    fab_scroll: 'Scroll',
    fab_collect_start: '▶ Thu Thập',
    fab_collect_stop: '⏹ Dừng',
    fab_download: '↓ Download',
    fab_downloading: '⏳ Đang tải...',
    fab_scrolling: '⟳ Đang scroll tự động...',

    // V4.x additions
    opt_skip_duplicates: 'Bỏ qua đã tải',
    btn_compact_title: 'Thu gọn giao diện',
    date_range_title: 'Lọc Theo Ngày',
    date_from: 'Từ',
    date_to: 'Đến',
    keyword_label: 'Keyword / Hashtag',
    keyword_placeholder: 'VD: #space hoặc cats',
    date_preset_7: '7 ngày',
    date_preset_30: '30 ngày',
    date_preset_90: '3 tháng',
    date_preset_year: 'Năm nay',
    filter_summary: '0 mục khớp',
    queue_title: 'Hàng Đợi (Queue)',
    queue_start: 'Bắt Đầu',
    queue_clear: 'Xóa',
    btn_add_queue: 'Thêm profile hiện tại vào hàng đợi',
    queue_empty_msg: 'Hàng đợi trống<br><small>Thêm profile vào queue để tải tuần tự mà không cần giám sát</small>',
    nav_main: 'Chính',
    nav_queue: 'Hàng đợi',
    nav_stats: 'Thống kê',
    stats_title: 'Phân Bổ Media',
    stat_total: 'Tổng số',
    stat_images: 'Ảnh',
    stat_videos: 'Video',
    stat_gifs: 'GIF',
    stat_hls: 'HLS',
    
    // Options
    opt_smart_filters: '🔍 Smart Filters (Lọc Thông Minh)',
    opt_filter_avatar: 'Lọc avatar & banner',
    opt_filter_card: 'Lọc ảnh preview link (Card)',
    opt_min_size: 'Kích thước ảnh tối thiểu (px)',
    opt_min_size_desc: 'Lọc bỏ ảnh có chiều rộng hoặc chiều cao nhỏ hơn giá trị này. Chỉ áp dụng khi X.com trả về metadata kích thước. Đặt 0 để tắt.',
    opt_snackbar: '🔔 Hiển thị tiến trình trên trang (Snackbar)',
    opt_snackbar_desc: 'Hiện progress bar mini ngay trên trang X.com khi đang tải — không cần mở popup theo dõi.',
    opt_notification: '🔔 Hiển thị thông báo khi hoàn thành',
    opt_notification_desc: 'Hiện thông báo của trình duyệt (Chrome Notification) khi tải xong một tác vụ.',
    opt_enable_bookmarks: '🔖 Bookmarks Scraper',
    opt_enable_bookmarks_desc: 'Cho phép quét trang /i/bookmarks để thu thập media từ bookmarks cá nhân. Tắt nếu bạn không dùng tính năng này.',
    opt_img_large_1200: 'Lớn (1200px)',
    opt_img_medium: 'Trung bình (600px)',
    opt_img_small: 'Nhỏ (300px)',
    opt_theme_system: 'System (Tự động) 🌓',
    opt_theme_dark: 'Dark Mode 🌙',
    opt_theme_light: 'Light Mode ☀️',
    section_data: '⚙️ Data & Settings',
    opt_export: 'Export Settings',
    opt_export_desc: 'Xuất toàn bộ cài đặt ra file JSON — dùng để backup hoặc chuyển sang máy khác.',
    opt_import: 'Import Settings',
    opt_import_desc: 'Nạp file JSON cài đặt đã export trước. Settings hiện tại sẽ bị ghi đè.',
    opt_reset: 'Reset to Default',
    opt_reset_desc: 'Đặt lại toàn bộ cài đặt về giá trị mặc định. Hành động này không thể hoàn tác.',
    btn_export: '📤 Export',
    btn_import: '📥 Import',
    btn_reset: '🔄 Reset',

  }
};

let _currentLang: string = 'en';

// Load ngôn ngữ từ chrome.storage.local
export async function loadI18n(): Promise<void> {
  try {
    const res = await chrome.storage.local.get('lang');
// @ts-ignore
    _currentLang = res.lang || 'en';
  } catch (e) {
    _currentLang = 'en';
  }
}

// Lấy chuỗi theo key
export function t(key: string): string {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key;
}

// Cập nhật DOM tự động dựa trên attribute data-i18n

export function applyI18nToDOM(root: Document | HTMLElement = document): void {
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
  
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });

  root.querySelectorAll('[data-i18n]').forEach((el) => {

    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);
    
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'button') {
      (el as HTMLInputElement).value = text;
    } else {
      let hasElementChildren = Array.from(el.childNodes).some(n => n.nodeType === 1);
      if (hasElementChildren) {
        let maxLen = -1;
        let bestNode: ChildNode | null = null;
        el.childNodes.forEach(n => {
          if (n.nodeType === 3 && n.textContent && n.textContent.trim().length > maxLen) {
            maxLen = n.textContent.trim().length;
            bestNode = n;
          }
        });
        if (bestNode) {
          (bestNode as ChildNode).textContent = text;
        } else {
          el.appendChild(document.createTextNode(text));
        }
      } else {
        el.innerHTML = text;
      }
    }
  });
}

// Cung cấp export nếu dùng module, hoặc gán vào window
if (typeof window !== 'undefined') {
  window.i18n = {
    load: loadI18n,
    t: t,
    applyToDOM: applyI18nToDOM,
    get lang() { return _currentLang; },
    set lang(l: string) { _currentLang = l; }
  };
}
