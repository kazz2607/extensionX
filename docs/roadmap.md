# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-04 | Phiên bản hiện tại: **5.0.5**

---

## 1. Kiến Trúc Hiện Tại (v5.0.5)

```text
extensionX/
├── package.json                   # Cấu hình npm & build scripts
├── tsconfig.json                  # Cấu hình TypeScript (strict: true)
├── vite.config.ts                 # Cấu hình Vite bundler
├── src/
│   ├── manifest.json              # Chrome Extension Manifest V3 (version 5.0.5)
│   ├── background/
│   │   ├── service-worker.ts      # Service Worker: core logic, queue, date filter
│   │   ├── tweet-api.ts           # Fallback API & User Session bypass CORS
│   │   ├── indexeddb.ts           # Storage layer (IndexedDB) cho mediaStore
│   │   ├── downloader.ts          # Logic tải file trực tiếp
│   │   ├── scraper.ts             # Logic cào dữ liệu fallback
│   │   ├── messages.ts            # Xử lý Chrome messaging
│   │   ├── queue.ts               # Xử lý hàng đợi tải (multi-profile)
│   │   └── utils.ts               # Tiện ích nội bộ SW
│   ├── content/
│   │   ├── content.ts             # Content script chạy trên x.com
│   │   ├── dom-scanner.ts         # Fallback quét DOM tìm thumbnail
│   │   ├── fab.ts                 # Floating Action Button trên trang X.com
│   │   ├── tweet-btn.ts           # Download Mini Button trên từng tweet
│   │   ├── snackbar.ts            # Progress Snackbar glassmorphism
│   │   └── page-interceptor.ts    # Hook fetch/XHR/JSON.parse (MAIN world)
│   ├── popup/
│   │   ├── popup.html             # 3-tab layout: Main / Queue / Stats
│   │   ├── popup.ts               # Tab nav, queue, donut chart, date filter
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html           # Cài đặt + Export/Import/Reset
│   │   └── options.ts
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.ts           # Xử lý HLS (ghép TS segments)
│   ├── lib/
│   │   ├── hls-fetcher.ts         # Parse & tải HLS m3u8
│   │   ├── i18n.ts                # Đa ngôn ngữ (EN/VI)
│   │   ├── utils.ts               # Tiện ích dùng chung UI
│   │   └── jszip.min.ts           # Thư viện tạo file ZIP (nếu dùng)
│   ├── types.ts                   # Định nghĩa các TypeScript Interfaces (Core Types)
│   └── _locales/                  # i18n: vi, en
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
[content.ts] Inject page-interceptor.ts vào MAIN world (document_start)
        │
        ▼
[page-interceptor.ts] Hook window.fetch, XMLHttpRequest, JSON.parse
        ├── Bắt GraphQL response (UserMedia, UserTweets, TweetDetail)
        ├── Parse JSON → extract media URLs (depth ≤ 35)
        └── dispatchEvent('X_MEDIA_FOUND', { urls, username })
        │
        ▼
[content.ts] Lắng nghe CustomEvent
        └── chrome.runtime.sendMessage({ type: 'MEDIA_FOUND', ... })
        │
        ▼
[service-worker.ts] Nhận message → addMediaItems()
        ├── tweetDateFromId(tweetId): Snowflake → timestamp ms  ← v4.3.0
        ├── Lưu vào mediaStore (Map in-memory) + persist session
        ├── Keep-alive bằng chrome.alarms (ping mỗi 24s khi đang tải)
        ├── Worker pool (CONCURRENCY = 1–5, cài được trong Options)
        └── Gửi FAB_UPDATE về tab & DOWNLOAD_DONE về popup sau khi xong
        │
        ▼
[chrome.downloads.download()] — Video/GIF MP4: tải thẳng
[offscreen.ts] — HLS: fetch TS segments → ghép → trả base64
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
| v5.0.0 | **Major TypeScript Rewrite** — Chuyển đổi 100% codebase sang TypeScript, sử dụng Vite Bundler & ESM |
| v5.0.2 | **Vite Bundle Fixes** — Fix lỗi không copy resources và scripts động ở chế độ production build |
| v5.0.3 | **Full UI Localization** — Hoàn thiện hệ thống đa ngôn ngữ (i18n), dịch 100% text giao diện bị gán cứng |
| v5.0.5 | **Queue Fix & Auto-Save** — Sửa triệt để lỗi Queue đứng khi sleep, thêm cơ chế Auto-save cho options page |
| v5.0.4 | **UI Fixes & Version Sync** — Sửa viền trắng popup dark mode, đồng bộ lại toàn bộ version cũ trong code và docs |

---

## 4. Đề Xuất Phát Triển Tiếp Theo (Phase 6+)

> Dự án đã hoàn thành xuất sắc toàn bộ Phase 5: Đại tu kiến trúc sang TypeScript. Dưới đây là lộ trình đề xuất cho các Phase tiếp theo để nâng tầm UX và tự động hoá.

---

### 🟡 4.1. Phase 6 — Nâng cấp Trải nghiệm người dùng (v6.0.0)

**Vấn đề:** Popup extension có không gian quá chật hẹp, không thể hiển thị được nhiều thông tin, ảnh preview hay quản lý hàng ngàn file media cùng lúc.

**Đề xuất (Full-page Dashboard & Gallery):**
- Xây dựng một trang **Dashboard** riêng biệt mở ở tab mới (`chrome-extension://.../dashboard.html`).
- **Media Gallery View**: Hiển thị ảnh/video dưới dạng lưới (Masonry) *trước khi* tải về. Cho phép người dùng tick chọn (checkbox) từng ảnh/video cụ thể để tải, thay vì phải tải toàn bộ.
- **Advanced Analytics**: Biểu đồ chi tiết về thói quen tải, profile tải nhiều nhất, phân tích dung lượng.
- **Search & Filter nâng cao**: Tìm kiếm history, lọc theo ngày, theo loại ngay trên giao diện lớn.

---

### 🔵 4.3. Phase 7 — Cloud & Tự động hoá (v7.0.0+)

**Vấn đề:** Người dùng tải quá nhiều sẽ đầy ổ cứng, và họ phải tự làm thủ công bằng tay mỗi ngày nếu muốn theo dõi một idol/profile.

**Đề xuất (Cloud Sync & Auto-fetch):**
- **Cloud Integration**: Tích hợp Google Drive API / Dropbox API. Tự động upload file thẳng lên Cloud mà không cần lưu qua ổ cứng máy tính.
- **Watch/Subscribe Profile**: Đánh dấu "Theo dõi" một profile. Extension sẽ chạy ngầm (Cron job), mỗi ngày tự động gọi API lấy các tweet mới nhất của profile đó và tải media mới về (dựa vào cơ chế Duplicate Detection đã có).

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

## 6. Ma Trận Ưu Tiên Mới (Phase 6+)

| Tính năng / Mục tiêu | Độ khó | Impact | Ưu tiên |
|---|---|---|---|
| **v6.0.0** Full-page Dashboard & Gallery View | ⭐⭐⭐ | 🔥🔥🔥 | 🟡 Trung bình |
| **v6.1.0** Selective Download (Chọn file để tải) | ⭐⭐ | 🔥🔥 | 🟡 Trung bình |
| **v7.0.0** Auto-fetch (Theo dõi tự động tải) | ⭐⭐⭐⭐⭐ | 🔥🔥🔥🔥 | 🔵 Thấp |
| **v7.1.0** Cloud Integration (G-Drive/Dropbox) | ⭐⭐⭐⭐ | 🔥🔥 | 🔵 Thấp |

---

## 7. Phiên Bản Tiếp Theo — Đề Xuất Lộ Trình

```
[QUÁ KHỨ]
v4.8.0  ── Keyword / Hashtag Filter + U4 Compact Mode                                  ✅ DONE
v5.0.0  ── Major rewrite: TypeScript migration, Vite Bundler, Modularization           ✅ DONE
v5.0.2  ── Vite Bundle Fixes for Production Mode                                       ✅ DONE
v5.0.3  ── Full UI Localization (i18n) for Popup & Options                             ✅ DONE

[TƯƠNG LAI]
v6.0.0  ── Full-page Dashboard, Masonry Media Gallery, Bulk Selection
v7.0.0  ── Automation: Background Cron-job Auto-fetch, Cloud Integration
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
