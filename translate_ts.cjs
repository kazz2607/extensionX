const fs = require('fs');

const path = 'src/lib/i18n.ts';
let code = fs.readFileSync(path, 'utf8');

const newEnKeys = `
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
`;

const newViKeys = `
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
`;

code = code.replace(/fab_scrolling: '⟳ Auto-scrolling...'/g, "fab_scrolling: '⟳ Auto-scrolling...',\n" + newEnKeys);
code = code.replace(/fab_scrolling: '⟳ Đang scroll tự động...'/g, "fab_scrolling: '⟳ Đang scroll tự động...',\n" + newViKeys);

const applyNew = `
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
`;

code = code.replace(/export function applyI18nToDOM\(root: Document \| HTMLElement = document\): void {\n  root\.querySelectorAll\('\[data-i18n\]'\)\.forEach\(\(el\) => {/g, applyNew);

fs.writeFileSync(path, code);

console.log('TS files patched successfully.');
