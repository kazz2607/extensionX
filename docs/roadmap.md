# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-04 | Phiên bản hiện tại: **4.8.0**

---

## 1. Kiến Trúc Hiện Tại (v4.8.0)

```
extensionX/
├── manifest.json                  # Chrome Extension Manifest V3 (version 4.3.0)
├── background/
│   ├── service-worker.js          # Service Worker: core logic, queue, date filter
│   ├── tweet-api.js               # Fallback API & User Session bypass CORS
│   └── indexeddb.js               # Storage layer (IndexedDB) cho mediaStore
├── content/
│   ├── content.js                 # Content script chạy trên x.com
│   ├── dom-scanner.js             # Fallback quét DOM tìm thumbnail
│   ├── fab.js                     # Floating Action Button trên trang X.com
│   ├── tweet-btn.js               # Download Mini Button trên từng tweet
│   ├── snackbar.js                # Progress Snackbar glassmorphism
│   └── page-interceptor.js        # Hook fetch/XHR/JSON.parse (MAIN world)
├── popup/
│   ├── popup.html                 # 3-tab layout: Main / Queue / Stats
│   ├── popup.js                   # Tab nav, queue, donut chart, date filter
│   └── popup.css
├── options/
│   ├── options.html               # Cài đặt + Export/Import/Reset
│   └── options.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js               # Xử lý HLS (ghép TS segments)
├── lib/
│   ├── hls-fetcher.js             # Parse & tải HLS m3u8
│   ├── i18n.js                    # Đa ngôn ngữ (EN/VI)
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
[service-worker.js] Nhận message → addMediaItems()
        ├── tweetDateFromId(tweetId): Snowflake → timestamp ms  ← v4.3.0
        ├── Lưu vào mediaStore (Map in-memory) + persist session
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

### ✅ Phase 4 — UX Nâng Cao (v4.0.0 → v4.5.0)
- **v4.0.0** Progress Snackbar — snackbar glassmorphism trên trang, realtime, auto-dismiss, toggle trong Options
- **v4.0.1** Bug Fixes — 7 lỗi sửa (tweetId guard, format=jpg, async, broadcastToTab, FAB i18n...)
- **v4.1.0** Duplicate Detection, Security S2, Sanitize S4, Notifications U3, System Theme U6
- **v4.2.0** Multi-Profile Queue, Popup v2 Tab Navigation (Main/Queue/Stats), Donut Chart, Options Export/Import/Reset
- **v4.3.0** Date Range Filter — Snowflake ID → timestamp, collapsible date picker, 4 presets, preview count realtime
- **v4.4.0** Likes & Bookmarks Tab, Incremental Persist (IndexedDB Migration), Visual Progress per File
- **v4.5.0** Adaptive Scroll Speed (Tự động điều chỉnh thời gian chờ dựa trên tốc độ API)
- **v4.6.0** HLS Download Song Song Per-File (FIFO queue, 2x file song song, 8 segments/file)
- **v4.7.0** S3 Rate Limiting (Token Bucket 20/phút) + S1 CSRF Auto-Refresh (tự refresh ct0)
- **v4.8.0** Keyword / Hashtag Filter + U4 Compact Mode

---

## 3. Tính Năng Đã Hoàn Thành

| Version | Tính năng |
|---|---|
| v3.6.0 | **Download Mini Button** — Nút ↓ xuất hiện trên từng tweet có media, click → tải ngay |
| v3.7.0 | **Session Restore** — Tự lưu phiên thu thập, khôi phục sau khi browser tắt/crash |
| v3.8.0 | **Smart Filters** — Tự động lọc avatar, banner, card preview, và ảnh nhỏ <150px |
| v3.9.0 | **FAB Draggable** — Kéo thả FAB lên/xuống trên cạnh phải, vị trí nhớ qua localStorage |
| v4.0.0 | **Progress Snackbar** — Snackbar glassmorphism trên trang X.com, realtime, auto-dismiss |
| v4.0.1 | **Bug Fixes** — Guard tweetId rỗng, bỏ format=jpg, async fix, broadcastToTab 1 tab |
| v4.1.0 | **Duplicate Detection** — Nhớ danh sách đã tải, bỏ qua file trùng + Security/Notification/Theme |
| v4.2.0 | **Multi-Profile Queue** — Hàng đợi nhiều profile tuần tự, Popup v2 3-tab, Donut Chart, Export/Import/Reset |
| v4.3.0 | **Date Range Filter** — Lọc media theo khoảng ngày (Snowflake → timestamp), preset, preview count |
| v4.4.0 | **Likes & Bookmarks Tab** — Tải từ `/likes` và `/i/bookmarks`, **IndexedDB** lưu siêu tốc, **Visual Progress** per file |
| v4.5.0 | **Adaptive Scroll Speed** — Đo tốc độ GraphQL tự động tinh chỉnh thời gian chờ cuộn trang, tránh sót file |
| v4.6.0 | **HLS Song Song Per-File** — FIFO queue 2 file HLS đồng thời, 8 TS segment/file, Promise+requestId SW |
| v4.7.0 | **S3 Rate Limiting + S1 CSRF Auto-Refresh** — Token Bucket 20 calls/phút, tự động refresh ct0 khi 403 |
| v4.8.0 | **Keyword Filter + Compact Mode** — Lọc media theo text của tweet, Giao diện thu gọn siêu tốc |

---

## 4. Đề Xuất Phát Triển Tiếp Theo

> Độ ưu tiên: 🔴 Cao — 🟡 Trung bình — 🔵 Thấp/Tùy chọn

---

### 🔴 4.1. Tính Năng Mới (Features)



#### v4.5.0 — Keyword / Hashtag Filter
**Vấn đề:** User muốn chỉ tải media từ các tweet có chứa từ khoá nhất định (ví dụ: tải ảnh từ các tweet về "space" của NASA).

**Đề xuất:**
- Lưu `tweetText` vào mỗi media item (extract từ GraphQL response)
- Thêm filter ô "Keyword" trong popup Date Range section
- SW filter theo `tweetText.includes(keyword)` trước khi download

**Files cần sửa:** `page-interceptor.js`, `service-worker.js`, `popup.html`, `popup.js`

---





### 🔴 4.3. Bảo Mật (Security)

### 🟡 4.4. Giao Diện (UI/UX)



#### U4 — Popup Mini Mode (Compact View)
**Vấn đề:** Popup hiện khá đầy đủ tính năng nhưng có thể cồng kềnh khi cần thao tác nhanh.

**Đề xuất:**
- Thêm nút **"Compact"** — ẩn tabs, history, folder info
- Compact mode: badge count + 2 nút Collect/Download + status line
- Persist compact preference vào `chrome.storage.local`

**Files cần sửa:** `popup.html`, `popup.css`, `popup.js`

---

## 5. Ghi Chú Kỹ Thuật Quan Trọng

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
| Dữ liệu mất khi SW restart | `persistSession()` debounce 2s → `chrome.storage.local`, restore banner |
| Ảnh rác lọt vào danh sách | Smart Filters: URL pattern + ngưỡng kích thước tối thiểu |
| FAB che nút của X.com | FAB Draggable: kéo handle trục Y, clamp viewport, persist localStorage |
| User không biết tiến độ | Progress Snackbar: `broadcastToTab()` → content.js → snackbar.js |
| video_placeholder tweetId rỗng | Guard `!/^\d{10,}$/.test(tweetId)` ở cả SW lẫn dom-scanner |
| DOM scanner ép format=jpg | Bỏ `searchParams.set('format','jpg')` — chỉ giữ `name=orig` |
| File tải trùng lặp | Duplicate Detection: `downloadedStore` Set<url>, persist 50k entries |
| Không biết download xong | Chrome Notifications API + toggle trong Options |
| Multi-profile phải giám sát | profileQueue persist storage.local, `startNextInQueue()` auto-chain |
| Popup chật thông tin | 3-tab layout (Main/Queue/Stats) + bottom nav bar + SVG donut chart |
| Cài đặt mất khi reset Chrome | Export/Import Settings JSON + Reset to Default |
| Không biết media từ ngày nào | Snowflake ID → `tweetDateFromId()` BigInt parse, `tweetDate` trên mỗi item |
| Phải tải toàn bộ rồi lọc thủ công | Date Range Filter: collapsible picker + 4 presets + preview count realtime |

---

## 6. Ma Trận Ưu Tiên (Còn Lại)

| Tính năng | Độ khó | Impact | Ưu tiên |
|---|---|---|---|
| **v4.8.0** Keyword / Hashtag Filter | ⭐⭐⭐ | 🔥🔥🔥 | 🟡 Trung bình |
| **U4** Compact Mode | ⭐⭐ | 🔥 | 🔵 Thấp |

---

## 7. Phiên Bản Tiếp Theo — Đề Xuất Lộ Trình

```
v4.1.0  ── Duplicate Detection + S2/S4 Security + U3 Notification + U6 System Theme  ✅ DONE
v4.2.0  ── Multi-Profile Queue + Popup v2 Tab Navigation + Options Export/Import       ✅ DONE
v4.3.0  ── Date Range Filter + Snowflake ID parser                                     ✅ DONE
v4.4.0  ── Likes & Bookmarks Tab + P4 Incremental Persist + U2 Visual Progress         ✅ DONE
v4.5.0  ── P1 Adaptive Scroll Speed                                                    ✅ DONE
v4.6.0  ── P3 HLS Download Song Song Per-File (FIFO queue, 8 segments)                 ✅ DONE
v4.7.0  ── S3 Rate Limiting (Token Bucket) + S1 CSRF Auto-Refresh                      ✅ DONE
v4.8.0  ── Keyword / Hashtag Filter + U4 Compact Mode                                  ✅ DONE
v5.0.0  ── Major rewrite: TypeScript migration, Full MV3
```

---

## 8. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [chrome.notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- [IndexedDB MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Twitter Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID)
