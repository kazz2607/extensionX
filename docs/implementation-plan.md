# X Media Downloader — Chrome Extension
## Phương Án Triển Khai Chi Tiết

> **Mục tiêu:** Extension Chrome cho phép người dùng tải toàn bộ media (ảnh, video, GIF) từ profile bất kỳ trên X.com (Twitter) về máy tính, tự động phân loại theo folder theo username.

---

## 1. Tổng Quan Kiến Trúc

```
extensionX/
├── manifest.json                  # Chrome Extension Manifest V3
├── background/
│   └── service-worker.js          # Service Worker (background logic)
├── content/
│   ├── content.js                 # Content script chạy trên x.com
│   └── page-interceptor.js        # Inject vào page context để hook fetch/XHR
├── offscreen/
│   ├── offscreen.html             # Offscreen document (fetch video Blob)
│   └── offscreen.js               # Logic fetch HLS và MP4 (tránh CORS)
├── popup/
│   ├── popup.html                 # Giao diện popup
│   ├── popup.js                   # Logic popup
│   └── popup.css                  # Style popup
├── options/
│   ├── options.html               # Trang cài đặt
│   └── options.js                 # Logic cài đặt
├── lib/
│   ├── hls-fetcher.js             # JSZip library (tạo file ZIP)
│   └── utils.js                   # Các hàm tiện ích dùng chung
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── implementation-plan.md     # File này
```

---

## 2. Luồng Hoạt Động (Flow)

```
User mở Profile Page (x.com/username/media)
        │
        ▼
[content.js] Nhận diện trang Profile Media
        │
        ├── Inject page-interceptor.js vào page context
        │
        ▼
[page-interceptor.js] Hook window.fetch
        │
        ├── Bắt response từ GraphQL endpoint: UserMedia
        ├── Parse JSON → extract media URLs (ảnh/video/GIF)
        └── dispatchEvent('X_MEDIA_FOUND', { urls, username })
        │
        ▼
[content.js] Lắng nghe CustomEvent
        │
        └── chrome.runtime.sendMessage({ type: 'MEDIA_FOUND', ... })
        │
        ▼
[service-worker.js] Nhận message, lưu vào chrome.storage
        │
        ├── Quản lý hàng đợi download (queue)
        ├── Scroll tự động để load thêm media (gửi lệnh về content.js)
        └── Khi đủ / user click Download → gửi sang offscreen
        │
        ▼
[offscreen.js] Fetch HLS / MP4 file media về dưới dạng Blob
        │
        ├── Trả objectURL về cho service-worker
        │
        ▼
[service-worker.js] Gọi chrome.downloads.download() để tải file
        │
        ├── Đặt tên và phân thư mục:
        │     username/
        │       ├── images/   (jpg, png, webp, gif)
        │       └── videos/   (mp4, ts)
```

---

## 3. Chi Tiết Từng Module

### 3.1. `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "X Media Downloader",
  "version": "3.1.0",
  "description": "Tải toàn bộ media từ profile X.com, tự động lưu vào folder username",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon48.png"
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://x.com/*", "https://twitter.com/*"],
      "js": ["content/content.js"],
      "run_at": "document_start"
    }
  ],
  "permissions": [
    "downloads",
    "storage",
    "scripting",
    "declarativeNetRequest",
    "offscreen",
    "tabs",
    "activeTab"
  ],
    "https://*.x.com/*",
    "https://*.twitter.com/*",
    "https://pbs.twimg.com/*",
    "https://video.twimg.com/*",
    "https://cdn.syndication.twimg.com/*"
  ],
  "web_accessible_resources": [
    {
      "resources": ["content/page-interceptor.js", "lib/*"],
      "matches": ["https://x.com/*", "https://twitter.com/*"]
    }
  ],
  "options_page": "options/options.html"
}
```

---

### 3.2. `content/page-interceptor.js` — Hook Fetch API

**Mục đích:** Chạy trong page context (không phải extension context) để có thể override `window.fetch`.

```javascript
(function () {
  'use strict';

  // GraphQL endpoints chứa media của X.com
  const MEDIA_ENDPOINTS = [
    'UserMedia',       // Timeline media của user
    'UserTweets',      // Tweets của user (có thể chứa media)
    'TweetDetail',     // Chi tiết tweet
  ];

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // Chỉ xử lý các endpoint liên quan
    const isMediaEndpoint = MEDIA_ENDPOINTS.some(ep => url.includes(ep));
    if (isMediaEndpoint) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        const mediaItems = extractMediaFromResponse(data, url);

        if (mediaItems.length > 0) {
          window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
            detail: { mediaItems, endpoint: url }
          }));
        }
      } catch (e) {
        // Bỏ qua lỗi parse JSON
      }
    }
    return response;
  };

  /**
   * Trích xuất media URLs từ GraphQL response của X.com
   * Cấu trúc JSON thường là:
   * data.user.result.timeline_v2.timeline.instructions[].entries[].content
   *   .itemContent.tweet_results.result.legacy.extended_entities.media[]
   */
  function extractMediaFromResponse(data, url) {
    const results = [];
    try {
      // Duyệt đệ quy qua object để tìm extended_entities hoặc media_url
      traverseForMedia(data, results);
    } catch (e) {}
    return results;
  }

  function traverseForMedia(obj, results, depth = 0) {
    if (depth > 15 || !obj || typeof obj !== 'object') return;

    // Tìm extended_entities.media
    if (obj.extended_entities && Array.isArray(obj.extended_entities.media)) {
      obj.extended_entities.media.forEach(media => {
        parseMediaItem(media, results);
      });
    }

    // Đệ quy
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        traverseForMedia(obj[key], results, depth + 1);
      }
    }
  }

  function parseMediaItem(media, results) {
    const type = media.type; // 'photo', 'video', 'animated_gif'
    const tweetId = media.source_status_id_str || media.id_str || '';

    if (type === 'photo') {
      // Lấy bản lớn nhất: thay ?format=jpg&name=small → name=orig
      let url = media.media_url_https || media.media_url;
      if (url) {
        url = url.replace(/name=\w+/, 'name=orig');
        results.push({ type: 'image', url, tweetId, ext: 'jpg' });
      }
    } else if (type === 'video' || type === 'animated_gif') {
      // Lấy bitrate cao nhất
      const variants = media.video_info?.variants || [];
      const best = variants
        .filter(v => v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (best) {
        results.push({ type: 'video', url: best.url, tweetId, ext: 'mp4' });
      }
    }
  }
})();
```

---

### 3.3. `content/content.js` — Content Script

```javascript
// Inject page-interceptor.js vào page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/page-interceptor.js');
script.onload = () => script.remove();
(document.head || document.documentElement).prepend(script);

// Lấy username từ URL (x.com/username hoặc x.com/username/media)
function getUsernameFromURL() {
  const match = location.pathname.match(/^\/([^/]+)/);
  return match ? match[1] : null;
}

// Lắng nghe media được tìm thấy từ page-interceptor
window.addEventListener('X_MEDIA_FOUND', (event) => {
  const username = getUsernameFromURL();
  chrome.runtime.sendMessage({
    type: 'MEDIA_FOUND',
    payload: {
      username,
      mediaItems: event.detail.mediaItems,
    }
  });
});

// Lắng nghe lệnh scroll từ service-worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_DOWN') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    // Báo lại khi đã scroll xong
    setTimeout(() => sendResponse({ done: true }), 1500);
    return true; // async response
  }

  if (message.type === 'GET_PAGE_INFO') {
    sendResponse({
      username: getUsernameFromURL(),
      url: location.href,
      isMediaPage: location.pathname.includes('/media'),
    });
  }
});
```

---

### 3.4. `background/service-worker.js` — Service Worker

```javascript
// Lưu trữ media theo username
const mediaStore = {}; // { username: Set<{url, type, ext, tweetId}> }
let downloadInProgress = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEDIA_FOUND') {
    const { username, mediaItems } = message.payload;
    if (!username || !mediaItems?.length) return;

    if (!mediaStore[username]) {
      mediaStore[username] = new Map(); // key: url, value: item
    }

    mediaItems.forEach(item => {
      if (!mediaStore[username].has(item.url)) {
        mediaStore[username].set(item.url, item);
      }
    });

    // Cập nhật badge count
    const count = mediaStore[username].size;
    chrome.action.setBadgeText({ text: count > 999 ? '999+' : String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#1DA1F2' });

    // Thông báo cho popup
    chrome.runtime.sendMessage({
      type: 'MEDIA_COUNT_UPDATE',
      payload: { username, count }
    }).catch(() => {}); // Popup có thể chưa mở
  }

  if (message.type === 'START_DOWNLOAD') {
    const { username } = message.payload;
    startDownload(username);
  }

  if (message.type === 'GET_MEDIA_COUNT') {
    const { username } = message.payload;
    sendResponse({ count: mediaStore[username]?.size || 0 });
    return true;
  }

  if (message.type === 'CLEAR_MEDIA') {
    const { username } = message.payload;
    delete mediaStore[username];
    chrome.action.setBadgeText({ text: '' });
  }
});

async function startDownload(username) {
  if (downloadInProgress) return;
  downloadInProgress = true;

  const items = Array.from(mediaStore[username]?.values() || []);
  if (!items.length) {
    downloadInProgress = false;
    return;
  }

  // Tạo offscreen document để xử lý ZIP
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Tạo file ZIP chứa media',
    });
  } catch (e) {
    // Document đã tồn tại, bỏ qua
  }

  // Gửi danh sách media sang offscreen để download và zip
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'CREATE_ZIP',
    payload: { username, items }
  });
}

// Nhận thông báo khi offscreen hoàn thành
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DOWNLOAD_COMPLETE') {
    downloadInProgress = false;
    // Thông báo cho popup
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_DONE',
      payload: message.payload
    }).catch(() => {});
  }
});
```

---

### 3.5. `offscreen/offscreen.js` — ZIP & Download

```javascript
// Lắng nghe message từ service worker
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'CREATE_ZIP') {
    const { username, items } = message.payload;
    await createAndDownloadZip(username, items);
  }
});

async function createAndDownloadZip(username, items) {
  const zip = new JSZip();
  const userFolder = zip.folder(username);
  const imagesFolder = userFolder.folder('images');
  const videosFolder = userFolder.folder('videos');

  let success = 0;
  let failed = 0;
  const total = items.length;

  // Thông báo tiến độ
  function reportProgress() {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      payload: { username, current: success + failed, total, success, failed }
    }).catch(() => {});
  }

  // Fetch từng file (song song, tối đa 5 concurrent)
  const CONCURRENCY = 5;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (item) => {
      try {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        // Đặt tên file: tweetId_index.ext
        const filename = `${item.tweetId || Date.now()}_${Math.random().toString(36).slice(2, 7)}.${item.ext}`;

        if (item.type === 'video') {
          videosFolder.file(filename, blob);
        } else {
          imagesFolder.file(filename, blob);
        }
        success++;
      } catch (e) {
        failed++;
        console.warn('Failed to fetch:', item.url, e);
      }
      reportProgress();
    }));
  }

  // Tạo ZIP blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE', // Không nén media (ảnh/video đã nén sẵn)
  });

  // Download
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${username}_media_${formatDate()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  // Thông báo hoàn thành
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_COMPLETE',
    payload: { username, success, failed, total }
  });
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
```

---

### 3.6. `popup/popup.html` — Giao Diện Popup

Popup hiển thị:
- Username của profile đang xem
- Số lượng media đã thu thập
- Progress bar khi đang download
- Nút **Start Collecting** (bắt đầu scroll auto + thu thập)
- Nút **Download ZIP** (tải về)
- Nút **Clear** (xóa danh sách)
- Lịch sử các username đã tải

---

### 3.7. `options/options.html` — Trang Cài Đặt

Cài đặt cho phép người dùng tuỳ chỉnh:
- **Loại media cần tải:** Ảnh / Video / GIF (checkbox)
- **Chất lượng ảnh:** Original / Large / Medium
- **Tốc độ scroll tự động** (slow / normal / fast)
- **Số lượng tối đa media** cần thu thập (0 = không giới hạn)
- **Định dạng tên file:** `{username}/{type}/{tweetId}.{ext}` (template)
- **Bật/tắt auto-scroll** khi vào trang media

---

## 4. Cấu Trúc File ZIP Đầu Ra

```
@elonmusk_media_20260526.zip
└── elonmusk/
    ├── images/
    │   ├── 1234567890_abc12.jpg
    │   ├── 1234567891_def34.jpg
    │   └── ...
    └── videos/
        ├── 1234567892_ghi56.mp4
        ├── 1234567893_jkl78.mp4
        └── ...
```

---

## 5. Xử Lý Các Trường Hợp Đặc Biệt

| Trường hợp | Giải pháp |
|---|---|
| Profile private | Hiển thị thông báo lỗi, yêu cầu người dùng login hoặc follow |
| Rate limit từ X.com | Tự động dừng + hiện countdown, tiếp tục sau delay |
| File ảnh/video lỗi (404) | Bỏ qua, ghi log vào `failed.txt` trong ZIP |
| Video HLS (.m3u8) | Xử lý qua service worker, fetch từng segment TS, ghép lại |
| GIF động | Download dưới dạng .mp4 (X.com convert GIF sang video) |
| Trùng lặp media | Dùng Map với key là URL, tự động deduplicate |
| ZIP > 2GB | Tách thành nhiều ZIP part |
| X.com thay đổi API | Fallback: parse từ DOM (img[src], video[src]) |

---

## 6. Phòng Chống Anti-Scraping

Để tránh bị X.com block:
1. **Delay ngẫu nhiên** giữa mỗi lần scroll: 1.5s – 3s (randomized)
2. **Không replay requests** — chỉ intercept requests người dùng tự generate khi scroll
3. **Respect rate limit:** Nếu nhận HTTP 429, dừng và chờ `Retry-After`
4. **Không hardcode Bearer Token** — dùng token từ cookie/header của browser session hiện tại

---

## 7. Lưu Ý Bảo Mật & Quyền Riêng Tư

- **Không gửi dữ liệu ra server ngoài** — toàn bộ xử lý local
- **Không lưu cookie hay token** của người dùng
- **Chỉ request quyền tối thiểu** cần thiết
- Cần **khai báo rõ** trong Chrome Web Store về quyền `downloads`, `storage`

---

## 8. Kế Hoạch Phát Triển (Phases)

### Phase 1 — MVP (2 tuần)
- [ ] Cấu trúc project, manifest.json
- [ ] page-interceptor.js hook fetch, extract media URLs
- [ ] content.js inject script + relay messages
- [ ] service-worker.js nhận + lưu media list
- [ ] offscreen.js tạo ZIP + download
- [ ] popup.html UI cơ bản (count + download button)
- [ ] Test manual trên 5 profile khác nhau

### Phase 2 — Tính Năng Nâng Cao (2 tuần)
- [ ] Auto-scroll để load thêm media
- [ ] Progress bar thời gian thực
- [ ] Options page (cài đặt chất lượng, loại media)
- [ ] Xử lý video HLS (.m3u8)
- [ ] Fallback parse từ DOM
- [ ] Lịch sử download (chrome.storage)

### Phase 3 — Hoàn Thiện (1 tuần)
- [ ] Tách ZIP lớn thành nhiều part
- [ ] Export danh sách URL (CSV)
- [ ] UI dark mode + polish
- [ ] Test tự động (Playwright/Puppeteer)
- [ ] Đóng gói, publish Chrome Web Store

---

## 9. Dependencies

| Thư viện | Version | Mục đích |
|---|---|---|
| JSZip | 3.10.x | Tạo file ZIP trong browser |
| (Không dùng framework) | — | Vanilla JS cho nhẹ và nhanh |

---

## 10. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [JSZip Documentation](https://stuk.github.io/jszip/)
- [X.com GraphQL Endpoints (unofficial)](https://github.com/zedeus/nitter/wiki/Twitter-API)

---

*Tài liệu cập nhật ngày: 2026-05-26 | Phiên bản: 3.1.0*
