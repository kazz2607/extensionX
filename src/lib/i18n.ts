// @ts-nocheck
/**
 * i18n.js — Custom Internationalization Module
 * Quản lý đa ngôn ngữ cho extension (Popup, Options, Content Scripts)
 */

const TRANSLATIONS = {
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
    fab_scrolling: '⟳ Auto-scrolling...'
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
    fab_scrolling: '⟳ Đang scroll tự động...'
  }
};

let _currentLang = 'en';

// Load ngôn ngữ từ chrome.storage.local
async function loadI18n() {
  try {
    const res = await chrome.storage.local.get('lang');
    _currentLang = res.lang || 'en';
  } catch (e) {
    _currentLang = 'en';
  }
}

// Lấy chuỗi theo key
function t(key) {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key;
}

// Cập nhật DOM tự động dựa trên attribute data-i18n
function applyI18nToDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    // Nếu phần tử có nội dung HTML phức tạp (có chứa span/code con), 
    // ta nên cẩn thận. Ở đây ta ưu tiên gán trực tiếp, trừ khi có xử lý đặc biệt.
    if (el.tagName === 'INPUT' && el.type === 'button') {
      el.value = text;
    } else {
      // Giữ lại các thẻ HTML bên trong nếu có (như SVG icon, tag version) bằng cách chỉ thay text node đầu tiên hoặc cuối cùng.
      // Nhưng đơn giản nhất là set textContent nếu phần tử chỉ chứa text, hoặc innerHTML.
      // Dùng innerHTML cho linh hoạt (nếu có thẻ <br>, <strong>).
      
      // Tuy nhiên nếu có SVG, ta cần thay thế cẩn thận. Tốt nhất là dùng child nodes
      let hasElementChildren = Array.from(el.childNodes).some(n => n.nodeType === 1);
      if (hasElementChildren) {
        // Tìm text node dài nhất và thay thế
        let maxLen = -1;
        let bestNode = null;
        el.childNodes.forEach(n => {
          if (n.nodeType === 3 && n.textContent.trim().length > maxLen) {
            maxLen = n.textContent.trim().length;
            bestNode = n;
          }
        });
        if (bestNode) {
          bestNode.textContent = text;
        } else {
          // Fallback append
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
    set lang(l) { _currentLang = l; }
  };
}
