const fs = require('fs');

const popupPath = 'src/popup/popup.html';
let popupHtml = fs.readFileSync(popupPath, 'utf8');

popupHtml = popupHtml
  .replace('title="Thu gọn giao diện"', 'data-i18n-title="btn_compact_title"')
  .replace('<p class="section-title">Date Range</p>', '<p class="section-title" data-i18n="date_range_title">Date Range</p>')
  .replace('<label for="filter-date-from">From</label>', '<label for="filter-date-from" data-i18n="date_from">From</label>')
  .replace('<label for="filter-date-to">To</label>', '<label for="filter-date-to" data-i18n="date_to">To</label>')
  .replace('<label for="filter-keyword">Keyword / Hashtag</label>', '<label for="filter-keyword" data-i18n="keyword_label">Keyword / Hashtag</label>')
  .replace('placeholder="e.g. #space or cats"', 'data-i18n-placeholder="keyword_placeholder"')
  .replace('<button class="btn-text btn-date-preset" data-days="7">7 days</button>', '<button class="btn-text btn-date-preset" data-days="7" data-i18n="date_preset_7">7 days</button>')
  .replace('<button class="btn-text btn-date-preset" data-days="30">30 days</button>', '<button class="btn-text btn-date-preset" data-days="30" data-i18n="date_preset_30">30 days</button>')
  .replace('<button class="btn-text btn-date-preset" data-days="90">3 months</button>', '<button class="btn-text btn-date-preset" data-days="90" data-i18n="date_preset_90">3 months</button>')
  .replace('<button class="btn-text btn-date-preset" data-days="365">This year</button>', '<button class="btn-text btn-date-preset" data-days="365" data-i18n="date_preset_year">This year</button>')
  .replace('<p class="filter-summary" id="filter-summary">0 items match</p>', '<p class="filter-summary" id="filter-summary" data-i18n="filter_summary">0 items match</p>')
  .replace('<span class="queue-title">Download Queue</span>', '<span class="queue-title" data-i18n="queue_title">Download Queue</span>')
  .replace('<button class="btn-text" id="btn-queue-start">Start</button>', '<button class="btn-text" id="btn-queue-start" data-i18n="queue_start">Start</button>')
  .replace('<button class="btn-text" id="btn-queue-clear">Clear</button>', '<button class="btn-text" id="btn-queue-clear" data-i18n="queue_clear">Clear</button>')
  .replace('Thêm profile hiện tại vào hàng đợi', '<span data-i18n="btn_add_queue">Thêm profile hiện tại vào hàng đợi</span>')
  .replace('Hàng đợi trống<br><small>Thêm profile vào queue để tải tuần tự mà không cần giám sát</small>', '<span data-i18n="queue_empty_msg">Hàng đợi trống<br><small>Thêm profile vào queue để tải tuần tự mà không cần giám sát</small></span>')
  .replace('<span class="nav-text">Main</span>', '<span class="nav-text" data-i18n="nav_main">Main</span>')
  .replace('<span class="nav-text">Queue</span>', '<span class="nav-text" data-i18n="nav_queue">Queue</span>')
  .replace('<span class="nav-text">Stats</span>', '<span class="nav-text" data-i18n="nav_stats">Stats</span>')
  .replace('<h2 class="stats-title">Media Breakdown</h2>', '<h2 class="stats-title" data-i18n="stats_title">Media Breakdown</h2>')
  .replace('<div class="stat-label">total</div>', '<div class="stat-label" data-i18n="stat_total">total</div>')
  .replace('<div class="stat-label">Images</div>', '<div class="stat-label" data-i18n="stat_images">Images</div>')
  .replace('<div class="stat-label">Videos</div>', '<div class="stat-label" data-i18n="stat_videos">Videos</div>')
  .replace('<div class="stat-label">GIFs</div>', '<div class="stat-label" data-i18n="stat_gifs">GIFs</div>')
  .replace('<div class="stat-label">HLS</div>', '<div class="stat-label" data-i18n="stat_hls">HLS</div>');

fs.writeFileSync(popupPath, popupHtml);

const optionsPath = 'src/options/options.html';
let optionsHtml = fs.readFileSync(optionsPath, 'utf8');

optionsHtml = optionsHtml
  .replace('🔍 Smart Filters', '<span data-i18n="opt_smart_filters">🔍 Smart Filters</span>')
  .replace('Lọc avatar &amp; banner', '<span data-i18n="opt_filter_avatar">Lọc avatar &amp; banner</span>')
  .replace('Lọc ảnh preview link (Card)', '<span data-i18n="opt_filter_card">Lọc ảnh preview link (Card)</span>')
  .replace('Kích thước ảnh tối thiểu (px)', '<span data-i18n="opt_min_size">Kích thước ảnh tối thiểu (px)</span>')
  .replace('Lọc bỏ ảnh có chiều rộng hoặc chiều cao nhỏ hơn giá trị này. Chỉ áp dụng khi X.com trả về metadata kích thước. Đặt 0 để tắt.', '<span data-i18n="opt_min_size_desc">Lọc bỏ ảnh có chiều rộng hoặc chiều cao nhỏ hơn giá trị này. Chỉ áp dụng khi X.com trả về metadata kích thước. Đặt 0 để tắt.</span>')
  .replace('🔔 Hiển thị tiến trình trên trang (Snackbar)', '<span data-i18n="opt_snackbar">🔔 Hiển thị tiến trình trên trang (Snackbar)</span>')
  .replace('Hiện progress bar mini ngay trên trang X.com khi đang tải — không cần mở popup theo dõi.', '<span data-i18n="opt_snackbar_desc">Hiện progress bar mini ngay trên trang X.com khi đang tải — không cần mở popup theo dõi.</span>')
  .replace('🔔 Hiển thị thông báo khi hoàn thành', '<span data-i18n="opt_notification">🔔 Hiển thị thông báo khi hoàn thành</span>')
  .replace('Hiện thông báo của trình duyệt (Chrome Notification) khi tải xong một tác vụ.', '<span data-i18n="opt_notification_desc">Hiện thông báo của trình duyệt (Chrome Notification) khi tải xong một tác vụ.</span>')
  .replace('>Large (1200px)<', ' data-i18n="opt_img_large_1200">Large (1200px)<')
  .replace('>Medium (600px)<', ' data-i18n="opt_img_medium">Medium (600px)<')
  .replace('>Small (300px)<', ' data-i18n="opt_img_small">Small (300px)<')
  .replace('>System (Tự động) 🌓<', ' data-i18n="opt_theme_system">System (Tự động) 🌓<')
  .replace('>Dark Mode 🌙<', ' data-i18n="opt_theme_dark">Dark Mode 🌙<')
  .replace('>Light Mode ☀️<', ' data-i18n="opt_theme_light">Light Mode ☀️<')
  .replace('⚙️ Data &amp; Settings', '<span data-i18n="section_data">⚙️ Data &amp; Settings</span>')
  .replace('Xuất toàn bộ cài đặt ra file JSON — dùng để backup hoặc chuyển sang máy khác.', '<span data-i18n="opt_export_desc">Xuất toàn bộ cài đặt ra file JSON — dùng để backup hoặc chuyển sang máy khác.</span>')
  .replace('Nạp file JSON cài đặt đã export trước. Settings hiện tại sẽ bị ghi đè.', '<span data-i18n="opt_import_desc">Nạp file JSON cài đặt đã export trước. Settings hiện tại sẽ bị ghi đè.</span>')
  .replace('Đặt lại toàn bộ cài đặt về giá trị mặc định. Hành động này không thể hoàn tác.', '<span data-i18n="opt_reset_desc">Đặt lại toàn bộ cài đặt về giá trị mặc định. Hành động này không thể hoàn tác.</span>')
  .replace('<strong>Export Settings</strong>', '<strong data-i18n="opt_export">Export Settings</strong>')
  .replace('<strong>Import Settings</strong>', '<strong data-i18n="opt_import">Import Settings</strong>')
  .replace('<strong>Reset to Default</strong>', '<strong data-i18n="opt_reset">Reset to Default</strong>')
  .replace('>📤 Export<', ' data-i18n="btn_export">📤 Export<')
  .replace('>📥 Import<', ' data-i18n="btn_import">📥 Import<')
  .replace('>🔄 Reset<', ' data-i18n="btn_reset">🔄 Reset<');

fs.writeFileSync(optionsPath, optionsHtml);

console.log('HTML files patched successfully.');
