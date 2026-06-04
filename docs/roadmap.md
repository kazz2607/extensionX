# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-04 | Phiên bản hiện tại: **5.1.0**

---

## 1. Kiến Trúc Hiện Tại (v5.0.5)

```text
extensionX/
├── package.json                   # Cấu hình npm & build scripts
├── tsconfig.json                  # Cấu hình TypeScript (strict: true)
├── vite.config.ts                 # Cấu hình Vite bundler
├── src/
│   ├── manifest.json              # Chrome Extension Manifest V3 (version 5.1.0)
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
- **v4.0.1** Bug Fixes — 7 lỗi sửa (tweetId guard, format=jpg, async, broadcastToTab 1 tab, FAB i18n...)
- **v4.1.0** Duplicate Detection, Security S2, Sanitize S4, Notifications U3, System Theme U6
- **v4.2.0** Multi-Profile Queue, Popup v2 Tab Navigation (Main/Queue/Stats), Donut Chart, Options Export/Import/Reset
- **v4.3.0** Date Range Filter — Snowflake ID → timestamp, collapsible date picker, 4 presets, preview count realtime
- **v4.4.0** Likes & Bookmarks Tab, Incremental Persist (IndexedDB Migration), Visual Progress per File
- **v4.5.0** Adaptive Scroll Speed (Tự động điều chỉnh thời gian chờ dựa trên tốc độ API)
- **v4.6.0** HLS Download Song Song Per-File (FIFO queue, 2x file song song, 8 segments/file)
- **v4.7.0** S3 Rate Limiting (Token Bucket 20/phút) + S1 CSRF Auto-Refresh (tự refresh ct0)
- **v4.8.0** Keyword / Hashtag Filter + U4 Compact Mode

### ✅ Phase 5 — TypeScript Migration & Hardening (v5.0.0 → v5.1.0)
- **v5.0.0** Major rewrite: 100% TypeScript, Vite bundler, ESM, strict: true
- **v5.0.1** web_accessible_resources fix: manifest → .js paths
- **v5.0.2** Vite Bundle Fixes — build config, rules.json copy, dynamic scripts
- **v5.0.3** Full i18n — 40+ cụm từ, data-i18n-title/placeholder, applyI18nToDOM mở rộng
- **v5.0.4** Dark mode border fix, đồng bộ version strings toàn bộ codebase
- **v5.0.5** Queue Engine fix (recover from SW sleep), auto-save options với debounce
- **v5.1.0** Bug Fixes P0 + Security Hardening P2: activeDownloads fix, options cache, duplicate detection, path traversal, CSRF scoping, URL validation, dynamic bearer token

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
| v5.1.0 | **Bug Fixes P0 + Security P2** — activeDownloads conflict, options cache (99% I/O reduction), mini-btn duplicate detection, path traversal fix, CSRF token scoping, URL path validation, dynamic bearer token pipeline |
| v5.0.5 | **Queue Fix & Auto-Save** — Sửa triệt để lỗi Queue đứng khi sleep, thêm cơ chế Auto-save cho options page |
| v5.0.4 | **UI Fixes & Version Sync** — Sửa viền trắng popup dark mode, đồng bộ lại toàn bộ version cũ trong code và docs |

---

## 4. 🔍 KẾT QUẢ AUDIT — Vấn Đề Phát Hiện Sau Code Review (2026-06-04)

> Audit toàn bộ source code (v5.0.5 → v5.1.0). Phần P0+P2 đã hoàn thành trong v5.1.0.

---

### 🔴 P0 — Lỗi Nghiêm Trọng (Critical Bugs)

#### BUG-01: `activeDownloads` Import Conflict trong `downloader.ts`
- **File:** `src/background/downloader.ts` dòng 3 và dòng 10
- **Vấn đề:** Import `activeDownloads` từ `state.ts` bị shadow bởi `const activeDownloads = new Map()` khai báo lại ngay phía dưới. Import bị vô hiệu. `// @ts-ignore` ở dòng import đang che giấu lỗi TypeScript thực sự.
- **Tác động:** `activeDownloads` trong `state.ts` (typed `Map<number, ActiveDownload>`) không được dùng. Dữ liệu progress không khớp với state tập trung.
- **Fix:** Xóa `const activeDownloads = new Map()` ở dòng 10, xóa `// @ts-ignore` trên import, dùng typed map từ `state.ts`.

#### BUG-02: Duplicate `KEEPALIVE_ALARM` Listener
- **File:** `src/background/service-worker.ts` và `src/background/downloader.ts`
- **Vấn đề:** Cả hai file đều đăng ký `chrome.alarms.onAlarm.addListener` cho cùng alarm `'sw-keepalive'`. Khi alarm fire, cả 2 listener đều chạy — double processing.
- **Fix:** Gom alarm listener về 1 nơi duy nhất (trong `downloader.ts` vì đó là nơi quản lý keepalive logic).

#### BUG-03: `applyOptionsFilter()` Gọi Storage I/O Mỗi Item
- **File:** `src/background/scraper.ts` — hàm `applyOptionsFilter()`
- **Vấn đề:** Hàm gọi `chrome.storage.sync.get('options')` mỗi lần được gọi. Trong session thu thập lớn, đây là hàng nghìn async I/O calls vào storage, gây lag và tiêu tốn tài nguyên SW.
- **Fix:** Cache options trong module-level variable, invalidate khi `chrome.storage.onChanged` fire (chỉ cần 1 read/session thay vì 1 read/item).

#### BUG-04: `handleDownloadTweet` Bỏ Qua Duplicate Detection
- **File:** `src/background/downloader.ts` — hàm `handleDownloadTweet()`
- **Vấn đề:** Mini-button download không gọi `loadDownloadedUrls()` trước khi tải, nên không kiểm tra file đã tải chưa (khác với `startDownload()` đã có bước này).
- **Fix:** Thêm `await loadDownloadedUrls(username)` + kiểm tra `isAlreadyDownloaded()` trong `handleDownloadTweet`.

---

### 🟠 P1 — Hiệu Năng (Performance)

#### PERF-01: `scrollLoop()` Đọc Options Mỗi Lần Khởi Động
- **File:** `src/background/scraper.ts` — hàm `scrollLoop()`
- **Vấn đề:** `chrome.storage.sync.get('options')` chỉ được đọc 1 lần khi `scrollLoop` khởi động — điều này ổn. Tuy nhiên, nếu options thay đổi trong khi scroll thì không có hiệu lực. Cần notification khi options thay đổi.
- **Fix:** Subscribe `chrome.storage.onChanged` để reload options vào cache và áp dụng cho scrollLoop đang chạy.

#### PERF-02: `ensureOffscreen()` Gọi `getContexts()` Mỗi File HLS
- **File:** `src/background/downloader.ts` — hàm `ensureOffscreen()`
- **Vấn đề:** Mỗi file HLS đều gọi `ensureOffscreen()` → `chrome.runtime.getContexts()` (async I/O). Với 2 file HLS song song và nhiều file, đây là nhiều I/O requests không cần thiết.
- **Fix:** Cache trạng thái offscreen trong module variable, reset khi SW restart. Chỉ gọi `getContexts()` khi chưa có cache.

#### PERF-03: `mediaStore` Không Có Giới Hạn Memory
- **File:** `src/background/state.ts`
- **Vấn đề:** `mediaStore` là `Map` in-memory không giới hạn. Profile với 100k+ media (account lớn) có thể chiếm RAM đáng kể (mỗi `MediaItem` ~200–300 bytes → 100k items ≈ 20–30MB).
- **Fix:** Thêm warning log khi `store.size > 50000`. Đề xuất user pause và download before continuing.

#### PERF-04: `buildCSV()` Không Chunk Large Datasets
- **File:** `src/background/downloader.ts` — hàm `buildCSV()`
- **Vấn đề:** `rows.join('\n')` trên 50k items tạo string khổng lồ trong memory trước khi trả về.
- **Fix:** Stream-build CSV theo chunk hoặc giới hạn CSV export ở 10k rows với pagination.

---

### 🔵 P2 — Bảo Mật (Security)

#### SEC-01: Path Traversal trong `sanitizeFolder()`
- **File:** `src/background/utils.ts` — hàm `sanitizeFolder()`
- **Vấn đề:** Hàm loại bỏ `\` và `/` đầu/cuối nhưng không ngăn `../` ở giữa đường dẫn. Ví dụ input `../../evil` sau sanitize vẫn là `../../evil`. Chrome `downloads.download()` có thể resolve đường dẫn này ra ngoài thư mục Downloads.
- **Fix:** Thêm bước replace `\.\.` và `..\/` sau sanitize, hoặc split/filter từng segment.

#### SEC-02: `ct0` CSRF Token Trên Global `self` Scope
- **File:** `src/background/messages.ts` dòng 116: `(self as any).userCsrfToken = ct0`
- **Vấn đề:** CSRF token được gán lên `self` (global scope của Service Worker) thay vì dùng module-level state. Bất kỳ code nào import vào SW đều có thể đọc được `self.userCsrfToken`.
- **Fix:** Dùng `setCsrfToken()` từ `state.ts` (đã export sẵn) thay vì gán trực tiếp lên `self`.

#### SEC-03: URL Validation Không Kiểm Tra Full Structure
- **File:** `src/content/content.ts` — hàm `validateMediaItem()`
- **Vấn đề:** Kiểm tra `url.startsWith('https://pbs.twimg.com/')` là đủ cho host, nhưng không validate path structure. URL kiểu `https://pbs.twimg.com/../../../../etc/passwd` về lý thuyết có thể pass validation.
- **Fix:** Thêm regex pattern cho phần path: chỉ cho phép `[a-zA-Z0-9/_\-.]` trong path component.

#### SEC-04: Guest Bearer Token Hardcoded — Rotation Risk
- **File:** `src/background/tweet-api.ts` dòng 12
- **Vấn đề:** Bearer token hardcode trong source. Nếu X.com rotate token (đã xảy ra trước đây), extension bị break hoàn toàn và phải release bản mới.
- **Fix:** Thêm fallback mechanism: thử extract Bearer từ network request (page-interceptor đã hook fetch) trước khi dùng hardcoded token. Lưu cached token vào `chrome.storage.session`.

#### SEC-05: `@ts-ignore` Che Giấu Type Errors Thực Sự
- **File:** `src/background/messages.ts` và `src/background/downloader.ts`
- **Vấn đề:** Có 20+ `// @ts-ignore` comments — mỗi cái là 1 type error tiềm ẩn bị bỏ qua, phá vỡ cam kết `strict: true` của TypeScript migration.
- **Fix:** Lần lượt fix từng `@ts-ignore`: thêm proper type annotation, cast đúng kiểu, hoặc update interfaces trong `types.ts`.

---

### 🟡 P3 — UI / UX

#### UI-01: Popup Không Hiển Thị Chi Tiết File Lỗi
- **Vấn đề:** Khi download xong, popup chỉ hiện "X failed" nhưng không cho biết file nào bị lỗi và lý do. User không có cách debug hoặc retry.
- **Fix:** Thêm expandable error log section trong popup, hiển thị filename + error message. Thêm "Retry failed" button để tải lại đúng file lỗi.

#### UI-02: Stats Tab Donut Chart Không Realtime
- **Vấn đề:** Stats tab hiển thị snapshot tại thời điểm mở popup, không tự cập nhật khi media mới được thu thập trong khi popup đang mở.
- **Fix:** Subscribe `MEDIA_COUNT_UPDATE` message trong Stats tab và re-render donut chart khi nhận được update.

#### UI-03: Options Auto-Save Không Có Visual Indicator
- **Vấn đề:** Sau khi thêm auto-save debounce (v5.0.5), user không biết liệu thay đổi đã được lưu hay chưa (đặc biệt trong 500ms debounce window).
- **Fix:** Thêm "Saving..." spinner hoặc "Saved ✓" toast ngắn sau mỗi lần auto-save thành công.

#### UI-04: Không Có Empty State Khi Media Store Trống
- **Vấn đề:** Popup hiển thị count "0" nhưng không có call-to-action hướng dẫn user bắt đầu. Người dùng mới không biết phải làm gì.
- **Fix:** Khi count = 0 và không đang collecting, hiển thị onboarding card: "Mở trang /media của profile và bấm Bắt đầu Thu thập".

#### UI-05: FAB Panel Không Hiển Thị Progress Tải Chi Tiết
- **Vấn đề:** Khi download đang chạy, FAB chỉ hiện button disabled nhưng không cho thấy % tiến độ hay file hiện tại. User phải mở popup để xem.
- **Fix:** Bổ sung mini progress ring hoặc text "45/120 (37%)" trên FAB khi download đang chạy.

#### UI-06: Queue Tab Không Cập Nhật Live Khi Profile Khác Đang Tải
- **Vấn đề:** Queue item đang `downloading` không hiện realtime progress (chỉ hiện status badge). User phải đoán tiến độ.
- **Fix:** Attach `DOWNLOAD_PROGRESS` broadcast vào queue item đang active, hiện mini progress bar trong Queue tab.

---

## 5. 🗺️ KẾ HOẠCH PHÁT TRIỂN TIẾP THEO

### ✅ Phase 5.1 — Bug Fixes & Security Hardening (v5.1.0) — HOÀN THÀNH
> **Kết quả:** Giải quyết toàn bộ P0 bugs và P2 security issues. Build sạch 0 lỗi.

**Đã hoàn thành:**
- [x] BUG-01: Fix `activeDownloads` import conflict — xóa redeclaration shadow trong `downloader.ts`
- [x] BUG-02: Gom `KEEPALIVE_ALARM` listener về 1 nơi — xóa listener trùng trong `service-worker.ts`
- [x] BUG-03: `getCachedOptions()` TTL 5s + `storage.onChanged` invalidate — giảm ~99% I/O reads
- [x] BUG-04: `handleDownloadTweet` có `loadDownloadedUrls` + `isAlreadyDownloaded` + `markDownloaded`
- [x] SEC-01: `sanitizeFolder()` split/filter từng segment, block `..` path traversal
- [x] SEC-02: CSRF token dùng `setCsrfToken()` + module-level `userCsrfToken`, không còn trên `self`
- [x] SEC-03: `validateMediaItem()` thêm regex check `pathname` chặn URL injection
- [x] SEC-04: Dynamic bearer pipeline: interceptor capture → content relay → SW `UPDATE_BEARER` → `getBearerToken()`
- [x] SEC-05: Loại bỏ 7 `@ts-ignore` critical trong `messages.ts` — typed arrays, optional chaining, `(err: any)`

---

### 🟠 Phase 5.2 — Performance Optimization (v5.2.0)
> **Mục tiêu:** Cải thiện hiệu năng cho large-scale collections (50k+ media).

**Scope:**
- [x] PERF-01: Options cache + `storage.onChanged` subscription ← **hoàn thành trong v5.1.0**
- [x] SEC-04: Dynamic bearer token extraction ← **hoàn thành trong v5.1.0**
- [ ] PERF-02: Offscreen document cache flag — bỏ `getContexts()` call mỗi file HLS
- [ ] PERF-03: Memory warning khi store > 50k items, suggest pause & download
- [ ] PERF-04: CSV export chunked / giới hạn 10k rows + pagination

**Kỳ vọng:** Giảm 80% storage I/O reads trong session thu thập lớn.

---

### 🟡 Phase 5.3 — UI Polish (v5.3.0)
> **Mục tiêu:** Hoàn thiện UX dựa trên các điểm yếu phát hiện trong audit.

**Scope:**
- [ ] UI-01: Error details panel trong popup + Retry failed downloads button
- [ ] UI-02: Stats tab donut chart realtime subscription
- [ ] UI-03: Auto-save visual indicator ("Saving..." / "Saved ✓")
- [ ] UI-04: Empty state onboarding card khi media = 0
- [ ] UI-05: Mini progress ring/text trên FAB khi download đang chạy
- [ ] UI-06: Live progress bar trong Queue tab cho item đang active

---

### 🟡 Phase 6 — Full-page Dashboard & Gallery (v6.0.0)

**Vấn đề:** Popup chỉ có chiều rộng 380px — không thể xem preview, không chọn từng file, không có advanced search.

**Đề xuất (Full-page Dashboard):**
- Xây dựng trang **Dashboard** riêng biệt mở ở tab mới (`chrome-extension://.../dashboard.html`).
- **Media Gallery View**: Lưới Masonry hiển thị ảnh/video thu thập được. Cho phép checkbox chọn file cụ thể trước khi tải.
- **Advanced Search & Filter**: Kết hợp date range + keyword + type filter trên giao diện lớn với preview count realtime.
- **History & Analytics**: Biểu đồ thống kê theo thời gian, profile tải nhiều nhất, breakdown dung lượng.

---

### 🔵 Phase 7 — Cloud & Tự động hoá (v7.0.0+)

**Đề xuất (Cloud Sync & Auto-fetch):**
- **Cloud Integration**: Tích hợp Google Drive API / Dropbox API — upload thẳng lên Cloud, không cần lưu qua ổ cứng.
- **Watch/Subscribe Profile**: Đánh dấu "Theo dõi" profile. Extension chạy Cron job ngầm, mỗi ngày tự lấy tweet mới + tải media mới (dựa vào Duplicate Detection đã có).

---

## 6. Ghi Chú Kỹ Thuật Quan Trọng

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

## 7. Ma Trận Ưu Tiên Tổng Hợp

| Hạng mục | Tác động | Độ khó | Ưu tiên |
|---|---|---|---|
| **BUG-01** `activeDownloads` conflict | 🔥🔥🔥 Data integrity | ⭐ | 🔴 Ngay |
| **BUG-02** Duplicate alarm listener | 🔥 Log noise | ⭐ | 🔴 Ngay |
| **BUG-03** Options I/O mỗi item | 🔥🔥🔥 Perf critical | ⭐⭐ | 🔴 Ngay |
| **BUG-04** Mini-btn bỏ qua dedup | 🔥🔥 UX correctness | ⭐ | 🔴 Ngay |
| **SEC-01** Path traversal | 🔥🔥🔥 Security | ⭐ | 🔴 Ngay |
| **SEC-02** CSRF token on `self` | 🔥🔥 Security | ⭐ | 🟠 Sớm |
| **SEC-03** URL path structure | 🔥 Security | ⭐ | 🟠 Sớm |
| **SEC-05** Fix @ts-ignore | 🔥🔥 Maintainability | ⭐⭐ | 🟠 Sớm |
| **PERF-02** Offscreen cache | 🔥🔥 HLS speed | ⭐ | 🟠 Sớm |
| **UI-01** Error details + retry | 🔥🔥🔥 UX | ⭐⭐ | 🟡 Trung bình |
| **UI-03** Auto-save indicator | 🔥🔥 UX | ⭐ | 🟡 Trung bình |
| **UI-04** Empty state onboarding | 🔥🔥 UX | ⭐ | 🟡 Trung bình |
| **UI-05** FAB progress ring | 🔥 UX | ⭐⭐ | 🟡 Trung bình |
| **UI-02** Stats donut realtime | 🔥 UX | ⭐ | 🟡 Trung bình |
| **SEC-04** Dynamic bearer token | 🔥🔥🔥 Stability | ⭐⭐⭐ | 🔵 Thấp |
| **PERF-03** Memory warning 50k | 🔥 UX | ⭐ | 🔵 Thấp |
| **v6.0.0** Dashboard + Gallery | 🔥🔥🔥 Feature | ⭐⭐⭐ | 🔵 Thấp |
| **v7.0.0** Cloud + Auto-fetch | 🔥🔥🔥🔥 Feature | ⭐⭐⭐⭐⭐ | 🔵 Thấp |

---

## 8. Lộ Trình Phiên Bản

```
[ĐÃ XONG]
v5.0.5  ── Queue Engine fix, Options Auto-save debounce                             ✅ DONE
v5.1.0  ── Bug Fixes P0 + Security Hardening P2 (9 issues fixed, build clean)      ✅ DONE

[TIẾP THEO]
v5.2.0  ── Performance: Offscreen cache, memory warning 50k, CSV chunked export     🟠 Ưu tiên trung bình
v5.3.0  ── UI Polish (UI-01..06: error details, realtime stats, FAB progress...)    🟡 Tiếp theo

[TƯƠNG LAI]
v6.0.0  ── Full-page Dashboard, Masonry Media Gallery, Bulk Selection
v7.0.0  ── Automation: Background Cron-job Auto-fetch, Cloud Integration
```

---

## 9. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [chrome.notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- [IndexedDB MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Twitter Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID)
