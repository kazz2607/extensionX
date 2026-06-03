# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-03 | Phiên bản hiện tại: **4.0.0**

---

## 1. Kiến Trúc Hiện Tại (v4.x)

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

### ✅ Phase 3 — Hoàn Thiện (v3.0.0 → v3.9.0)
- **v3.0–3.4** Direct download, bypass CORS, Hook JSON.parse+XHR, i18n, Dark/Light mode
- **v3.5.x** macOS fix, SW keep-alive, worker pool, IDM detect, context invalidation
- **v3.6.0** Download Mini Button trên từng tweet
- **v3.7.0** Session Restore — `persistSession()` / `clearSession()`, restore banner
- **v3.8.0** Smart Filters — lọc avatar/banner/card-preview + kích thước tối thiểu
- **v3.9.0** FAB Draggable — drag handle trục Y, viewport clamp, persist `localStorage`

### ✅ Phase 4 — UX Nâng Cao (v4.0.0)
- **v4.0.0** Progress Snackbar — snackbar glassmorphism trên trang, realtime, auto-dismiss, toggle trong Options

---

## 3. Tính Năng Đã Hoàn Thành & Kế Hoạch Tiếp Theo

### ✅ Đã Hoàn Thành

| Version | Tính năng |
|---|---|
| v3.6.0 | **Download Mini Button** — Nút ↓ xuất hiện trên từng tweet có media, click → tải ngay |
| v3.7.0 | **Session Restore** — Tự lưu phiên thu thập, khôi phục sau khi browser tắt/crash |
| v3.8.0 | **Smart Filters** — Tự động lọc avatar, banner, card preview, và ảnh nhỏ <150px khỏi danh sách media |
| v3.9.0 | **FAB Draggable** — Kéo thả FAB lên/xuống trên cạnh phải, vị trí được nhớ qua localStorage |
| v4.0.0 | **Progress Snackbar** — Snackbar glassmorphism trên trang X.com, realtime progress, auto-dismiss, toggle trong Options |

### 🔲 Đang Kế Hoạch

*Không có — tất cả roadmap đã hoàn thành!* 🎉

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
| Ảnh rác (avatar, card, icon) lọt vào danh sách | Smart Filters: lọc URL pattern `/profile_images/`, `/profile_banners/`, `/card_img/` + ngưỡng kích thước tối thiểu |
| FAB che nút của X.com | FAB Draggable: kéo handle trục Y, clamp viewport, persist `localStorage` |
| User không biết tiến độ khi popup đóng | Progress Snackbar: `broadcastToTab()` → content.js relay → snackbar.js |

---

## 5. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
