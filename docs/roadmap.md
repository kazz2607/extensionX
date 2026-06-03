# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-03 | Phiên bản hiện tại: **3.7.0**

---

## 1. Kiến Trúc Hiện Tại (v3.7.x)

```
extensionX/
├── manifest.json                  # Chrome Extension Manifest V3
├── background/
│   ├── service-worker.js          # Service Worker (core logic, download queue)
│   └── tweet-api.js               # Fallback API & User Session bypass CORS
├── content/
│   ├── content.js                 # Content script chạy trên x.com
│   ├── dom-scanner.js             # Fallback quét DOM tìm thumbnail
│   ├── fab.js                     # Floating Action Button trên trang X.com
│   ├── tweet-btn.js               # Download Mini Button trên từng tweet
│   └── page-interceptor.js        # Hook fetch/XHR/JSON.parse (MAIN world)
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   └── options.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js               # Xử lý HLS (ghép TS segments)
├── lib/
│   ├── hls-fetcher.js             # Parse & tải HLS m3u8
│   └── utils.js
├── _locales/                      # i18n: vi, en
├── rules.json                     # declarativeNetRequest rules
└── docs/
    ├── roadmap.md                 # File này
    ├── huong-dan-cai-dat.md
    └── publish-guide.md
```

### Luồng Hoạt Động

```
User mở Profile Page (x.com/username/media)
        │
        ▼
[content.js] Inject page-interceptor.js vào MAIN world (document_start)
        │
        ▼
[page-interceptor.js] Hook window.fetch, XMLHttpRequest, JSON.parse
        ├── Bắt GraphQL response (UserMedia, UserTweets, TweetDetail)
        ├── Parse JSON → extract media URLs (depth ≤ 35)
        └── dispatchEvent('X_MEDIA_FOUND', { urls, username })
        │
        ▼
[content.js] Lắng nghe CustomEvent
        └── chrome.runtime.sendMessage({ type: 'MEDIA_FOUND', ... })
        │
        ▼
[service-worker.js] Nhận message, lưu vào mediaStore (Map in-memory) + persist vào chrome.storage.local (Session Restore)
        ├── Keep-alive bằng chrome.alarms (ping mỗi 24s khi đang tải)
        ├── Worker pool (CONCURRENCY = 1–5, cài được trong Options)
        └── Gửi FAB_UPDATE về tab & DOWNLOAD_DONE về popup sau khi xong
        │
        ▼
[chrome.downloads.download()] — Video/GIF MP4: tải thẳng
[offscreen.js] — HLS: fetch TS segments → ghép → trả base64
        │
        ▼
File được lưu vào:
  Downloads/{baseFolder}/{username}/images/   ← ảnh
  Downloads/{baseFolder}/{username}/videos/   ← mp4
  Downloads/{baseFolder}/{username}/gifs/     ← gif mp4
```

---

## 2. Trạng Thái Hoàn Thành (theo CHANGELOG)

### ✅ Phase 1 — MVP (v1.0.0)
- GraphQL Interceptor hook fetch/XHR
- Content script inject + relay messages
- Service Worker nhận & lưu media list
- Auto-scroll cơ bản
- Popup UI (count + download button)

### ✅ Phase 2 — Tính Năng Nâng Cao (v2.0.0)
- HLS video support (hls-fetcher, offscreen)
- DOM Scanner fallback (MutationObserver)
- Floating Action Button (FAB) trên trang X.com
- Filter tabs (All / Images / Videos / GIFs)
- Progress bar realtime
- Export CSV

### ✅ Phase 3 — Hoàn Thiện (v3.0.0 → v3.7.0)
- **v3.0** Direct download (bỏ ZIP), thư mục theo username, Options mới
- **v3.1** Bypass CORS syndication API, MAIN world injection chuẩn
- **v3.2** Hook JSON.parse + XHR, duplicate check, NSFW bypass
- **v3.3** Light/Dark mode, đặt tên file username_TweetID_Serial
- **v3.4** i18n (vi/en), auto-scroll ổn định, dừng đúng lúc
- **v3.5.0** Sửa macOS (direct MP4 download, inject sớm hơn), tăng depth JSON → 35
- **v3.5.1** SW keep-alive (chrome.alarms), timeout 90s/file, popup restore state
- **v3.5.2** Worker pool concurrency đúng (lazy pool thay vì map())
- **v3.5.3** IDM conflict detection (isIdmHijack), cảnh báo cam
- **v3.5.4** Context invalidation: flag `_contextDead`, đổi warn→debug
- **v3.5.5** FAB isDownloading flag + FAB_UPDATE từ SW sau download xong
- **v3.6.0** Download Mini Button trên từng tweet, refactor `downloadSingleItem()` module-level
- **v3.7.0** Session Restore — `persistSession()` / `clearSession()`, restore banner trong popup

---

## 3. Tính Năng Đã Hoàn Thành & Kế Hoạch Tiếp Theo

### ✅ Đã Hoàn Thành

| Version | Tính năng |
|---|---|
| v3.6.0 | **Download Mini Button** — Nút ↓ xuất hiện trên từng tweet có media, click → tải ngay |
| v3.7.0 | **Session Restore** — Tự lưu phiên thu thập, khôi phục sau khi browser tắt/crash |

### 🔲 Đang Kế Hoạch

#### FAB Draggable
- **Mô tả:** FAB đôi khi che các nút của X.com. Thêm kéo thả để user di chuyển FAB lên/xuống mép màn hình.
- **Ưu tiên:** Thấp — UX cải thiện

#### Smart Filters
- **Mô tả:** Lọc ảnh rác (avatar nhỏ <150px, icon). Chỉ tải media chất lượng cao thực sự.
- **Ưu tiên:** Thấp

#### Progress Snackbar trên trang X.com
- **Mô tả:** Hiển thị tiến trình download dưới dạng snackbar mini trên trang (không cần mở popup).
- **Ưu tiên:** Trung bình — cải thiện UX khi download nhiều file

---

## 4. Ghi Chú Kỹ Thuật Quan Trọng

| Vấn đề | Giải pháp đã áp dụng |
|---|---|
| SW bị Chrome terminate | `chrome.alarms` keep-alive mỗi 24s khi đang tải |
| Download treo vô hạn | Timeout 90s/file + `Promise.race` |
| Script injection CSP | `chrome.scripting.executeScript` với `world: "MAIN"` |
| IDM hijack download | `isIdmHijack()` phát hiện + coi là thành công |
| Extension context dead | Flag `_contextDead` chỉ cleanup 1 lần, `console.debug` thay `warn` |
| Concurrency bị bỏ qua | Lazy worker pool thay `items.map()` |
| macOS MP4 message limit | Bỏ Offscreen cho MP4, tải thẳng qua `chrome.downloads.download(url)` |
| JSON depth quá nông | Tăng depth đệ quy từ 15 → 35 |
| Dữ liệu mất khi SW/browser restart | `persistSession()` debounce 2s → `chrome.storage.local`, restore banner trong popup |

---

## 5. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
